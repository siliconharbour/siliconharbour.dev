import { afterEach, expect, it, vi } from "vitest";
import { operationCatalog as operations } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { directoryImportConfigs } from "~/lib/directory-import-config.server";
import { runDirectoryImportAction } from "~/lib/admin/directory-import-action.server";
import { db } from "~/db";
import { companies, education } from "~/db/schema";
import { eq } from "drizzle-orm";
vi.mock("~/lib/session.server", () => ({
  requireAdmin: async () => ({ user: { id: 1, role: "admin" } }),
}));
afterEach(() => vi.restoreAllMocks());
const context = { ...adminContext(1), now: () => new Date("2026-10-24T12:00:00Z") };
const entry = (name: string, sourceId: string, website: string | null = null) => ({
  name,
  sourceId,
  website,
  description: null,
  email: null,
  logoUrl: null,
  categories: [],
  sourceUrl: "",
});
it("previews are read-only, reconciliation records external IDs, and renamed entries match their stored identity", async () => {
  const company = await operations.companyCreate.execute(context, {
    name: "Acme",
    description: "Curated",
    website: "https://acme.example",
    technl: true,
  });
  const gone = await operations.companyCreate.execute(context, {
    name: "Gone",
    description: "Curated",
    technl: true,
    genesis: true,
    visible: true,
  });
  const school = await operations.educationCreate.execute(context, {
    name: "School",
    description: "Description",
    technl: true,
    type: "other",
  });
  const fetch = vi
    .spyOn(directoryImportConfigs.technl, "scrapeFn")
    .mockResolvedValue([entry("Acme", "a", "https://acme.example"), entry("School", "s")]);
  const before = db.select().from(companies).where(eq(companies.id, company.id)).get();
  const preview = await operations.directoryImportFetch.execute(context, {
    source: "technl",
    confirm: true,
  });
  expect(preview.droppedOff.map((item) => item.id)).toEqual([gone.id]);
  expect(db.select().from(companies).where(eq(companies.id, company.id)).get()).toEqual(before);
  await operations.directorySourceReconcile.execute(context, { source: "technl", confirm: true });
  expect(db.select().from(companies).where(eq(companies.id, company.id)).get()).toMatchObject({
    description: "Curated",
    technlExternalId: "a",
    technlLastSeenAt: expect.any(Date),
  });
  expect(db.select().from(education).where(eq(education.id, school.id)).get()).toMatchObject({
    technlExternalId: "s",
    technlLastSeenAt: expect.any(Date),
  });
  fetch.mockResolvedValue([
    entry("Renamed entirely", "a", "https://new.example"),
    entry("School", "s"),
  ]);
  const renamed = await operations.directoryImportFetch.execute(context, {
    source: "technl",
    confirm: true,
  });
  expect(renamed.droppedOff.map((item) => item.id)).toEqual([gone.id]);
  await operations.directoryImport.execute(context, {
    source: "technl",
    companies: [entry("Another rename", "a")],
    downloadLogos: false,
  });
  expect((await operations.companyGet.execute(context, { id: company.id })).name).toBe("Acme");
  await operations.directoryImport.execute(context, {
    source: "technl",
    companies: [{ name: "Acme" }],
    downloadLogos: false,
  });
  expect(await operations.companyGet.execute(context, { id: company.id })).toMatchObject({
    technlExternalId: "a",
    technlLastSeenAt: "2026-10-24T12:00:00.000Z",
  });
  await operations.directorySourceFlagsClear.execute(context, {
    source: "technl",
    entities: [{ type: "company", id: company.id }],
    confirm: true,
  });
  expect(await operations.companyGet.execute(context, { id: company.id })).toMatchObject({
    technl: false,
    technlExternalId: "a",
    technlLastSeenAt: "2026-10-24T12:00:00.000Z",
  });
});
it("suppresses removals for empty or suspiciously small scrapes and offers possible rename matches", async () => {
  for (const name of ["Acme Labs Inc.", "Other One", "Other Two", "Other Three", "Other Four"])
    await operations.companyCreate.execute(context, {
      name,
      description: "Description",
      technl: true,
    });
  const fetch = vi.spyOn(directoryImportConfigs.technl, "scrapeFn").mockResolvedValue([]);
  expect(
    await operations.directoryImportFetch.execute(context, { source: "technl", confirm: true }),
  ).toMatchObject({ droppedOff: [], warning: expect.any(String) });
  fetch.mockResolvedValue([entry("New name", "a")]);
  expect(
    await operations.directoryImportFetch.execute(context, { source: "technl", confirm: true }),
  ).toMatchObject({ droppedOff: [], warning: expect.any(String) });
  expect(
    await operations.directorySourceReconcile.execute(context, { source: "technl", confirm: true }),
  ).toMatchObject({ recorded: 0, warning: expect.any(String) });
  fetch.mockResolvedValue([
    entry("Acme Lab Inc.", "a"),
    entry("Unrelated", "b"),
    entry("Elsewhere", "c"),
  ]);
  const preview = await operations.directoryImportFetch.execute(context, {
    source: "technl",
    confirm: true,
  });
  expect(
    preview.droppedOff.find((item) => item.name === "Acme Labs Inc.")?.possibleMatch?.name,
  ).toBe("Acme Lab Inc.");
});
it("clears only reviewed flags through admin and MCP operations and validates the entire batch first", async () => {
  const company = await operations.companyCreate.execute(context, {
    name: "Company",
    description: "Description",
    technl: true,
    genesis: true,
    visible: true,
  });
  const school = await operations.educationCreate.execute(context, {
    name: "School",
    description: "Description",
    technl: true,
  });
  await expect(
    operations.directorySourceFlagsClear.execute(context, {
      source: "technl",
      entities: [{ type: "company", id: company.id }],
    }),
  ).rejects.toThrow();
  await expect(
    operations.directorySourceFlagsClear.execute(context, {
      source: "technl",
      entities: [
        { type: "company", id: company.id },
        { type: "education", id: 999 },
      ],
      confirm: true,
    }),
  ).rejects.toThrow("not found");
  expect((await operations.companyGet.execute(context, { id: company.id })).technl).toBe(true);
  const form = new FormData();
  form.set("intent", "clear-flags");
  form.set(
    "entities",
    JSON.stringify([
      { type: "company", id: company.id },
      { type: "education", id: school.id },
    ]),
  );
  expect(
    await runDirectoryImportAction(
      new Request("https://example.com/manage", { method: "POST", body: form }),
      "technl",
    ),
  ).toMatchObject({ cleared: 2 });
  expect(await operations.companyGet.execute(context, { id: company.id })).toMatchObject({
    technl: false,
    genesis: true,
    visible: true,
  });
  expect((await operations.educationGet.execute(context, { id: school.id })).technl).toBe(false);
});
