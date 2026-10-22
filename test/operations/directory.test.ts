import { afterEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { operationCatalog as operations } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { createCodeMode } from "~/mcp/code-mode";
import { buildExecuteFunctions } from "~/mcp/bridge";
import { db } from "~/db";
import { people } from "~/db/schema";
import { eq } from "drizzle-orm";
import { isBlocked, getBlockedExternalIds } from "~/lib/import-blocklist.server";
import * as images from "~/lib/images.server";
import * as publicImages from "~/lib/public-image-fetch.server";
import { action as editPerson } from "~/routes/manage/people/edit";
import { action as editCompany } from "~/routes/manage/companies/edit";
import { action as editProject } from "~/routes/manage/projects/edit";

vi.mock("~/lib/session.server", () => ({
  requireAdmin: async () => ({ user: { id: 1, role: "admin" } }),
}));
afterEach(() => vi.restoreAllMocks());
const context = adminContext(1);

async function execute(name: string, input: unknown) {
  const runtime = createCodeMode(buildExecuteFunctions(adminContext(1, "mcp")));
  const result = await Effect.runPromise(
    runtime.execute(`return await tools.siliconharbour.${name}(${JSON.stringify(input)});`),
  );
  expect(result.ok).toBe(true);
}
function request(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("https://example.com/manage", { method: "POST", body: form });
}

for (const name of [
  "person",
  "company",
  "education",
  "group",
  "product",
  "project",
  "technology",
] as const) {
  it(`${name} create/get returns its declared output, and empty updates fail`, async () => {
    const create = operations[`${name}Create`];
    const row = await create.execute(context, create.examples[0].input);
    expect(create.output.safeParse(row).success).toBe(true);
    const get = operations[`${name}Get`];
    const stored = await get.execute(context, { id: row.id });
    expect(get.output.safeParse(stored).success).toBe(true);
    expect(stored).toMatchObject({ id: row.id, name: row.name });
    await expect(operations[`${name}Update`].execute(context, { id: row.id })).rejects.toThrow(
      "No fields to update",
    );
  });
}

describe("directory admin/MCP parity", () => {
  it("saves typed social links through either transport", async () => {
    const first = await operations.personCreate.execute(context, { name: "First", bio: "Bio" });
    const second = await operations.personCreate.execute(context, { name: "Second", bio: "Bio" });
    await editPerson({
      request: request({
        name: "First",
        bio: "New bio",
        twitter: "https://example.com/me",
        visible: "true",
      }),
      params: { id: String(first.id) },
    } as Parameters<typeof editPerson>[0]);
    await execute("personUpdate", {
      id: second.id,
      name: "Second",
      bio: "New bio",
      socialLinks: { twitter: "https://example.com/me" },
      visible: true,
    });
    const a = await operations.personGet.execute(context, { id: first.id });
    const b = await operations.personGet.execute(context, { id: second.id });
    expect({ bio: a.bio, socialLinks: a.socialLinks, visible: a.visible }).toEqual({
      bio: b.bio,
      socialLinks: b.socialLinks,
      visible: b.visible,
    });
  });
  it("saves company email, careers URL, and Bounce flags through either transport", async () => {
    const first = await operations.companyCreate.execute(context, {
      name: "First",
      description: "Description",
    });
    const second = await operations.companyCreate.execute(context, {
      name: "Second",
      description: "Description",
    });
    await editCompany({
      request: request({
        name: "First",
        description: "Description",
        email: "hello@example.com",
        careersUrl: "https://example.com/jobs",
        bounce: "on",
        visible: "true",
      }),
      params: { id: String(first.id) },
    } as Parameters<typeof editCompany>[0]);
    await execute("companyUpdate", {
      id: second.id,
      email: "hello@example.com",
      careersUrl: "https://example.com/jobs",
      bounce: true,
      visible: true,
    });
    const a = await operations.companyGet.execute(context, { id: first.id });
    const b = await operations.companyGet.execute(context, { id: second.id });
    expect({
      email: a.email,
      careersUrl: a.careersUrl,
      bounce: a.bounce,
      visible: a.visible,
    }).toEqual({ email: b.email, careersUrl: b.careersUrl, bounce: b.bounce, visible: b.visible });
  });
  it("saves project links through either transport", async () => {
    const first = await operations.projectCreate.execute(context, {
      name: "First",
      description: "Description",
    });
    const second = await operations.projectCreate.execute(context, {
      name: "Second",
      description: "Description",
    });
    await editProject({
      request: request({
        name: "First",
        description: "Description",
        type: "other",
        status: "active",
        github: "https://github.com/example/project",
        pypi: "https://pypi.org/project/example/",
      }),
      params: { id: String(first.id) },
    } as Parameters<typeof editProject>[0]);
    await execute("projectUpdate", {
      id: second.id,
      links: {
        github: "https://github.com/example/project",
        pypi: "https://pypi.org/project/example/",
      },
    });
    expect((await operations.projectGet.execute(context, { id: first.id })).links).toEqual(
      (await operations.projectGet.execute(context, { id: second.id })).links,
    );
  });
});

it("rejects unsupported nested link fields without saving a partial update", async () => {
  const person = await operations.personCreate.execute(context, { name: "Person", bio: "Bio" });
  await expect(
    operations.personUpdate.execute(context, {
      id: person.id,
      bio: "Changed",
      socialLinks: { bogus: "https://example.com" },
    }),
  ).rejects.toThrow("bogus");
  expect((await operations.personGet.execute(context, { id: person.id })).bio).toBe("Bio");
});
it("creates a reference row through the shared company update service", async () => {
  const person = await operations.personCreate.execute(context, {
    name: "Jane Harbour",
    bio: "Bio",
    visible: true,
  });
  const company = await operations.companyCreate.execute(context, {
    name: "Company",
    description: "Description",
  });
  await operations.companyUpdate.execute(context, {
    id: company.id,
    description: `Works with [[${person.name}]]`,
  });
  const { getOutgoingReferences } = await import("~/lib/references.server");
  expect(await getOutgoingReferences("company", company.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ targetType: "person", targetId: person.id }),
    ]),
  );
});
it("blocks the GitHub login used by importers before rejecting a person", async () => {
  const person = await operations.personCreate.execute(context, {
    name: "Person",
    bio: "Bio",
    github: "https://github.com/ExampleUser",
  });
  await operations.personReject.execute(context, { id: person.id, confirm: true });
  expect(await isBlocked("github", "exampleuser")).toBe(true);
  expect((await getBlockedExternalIds("github")).has("exampleuser")).toBe(true);
});
it("clears and deletes an unreferenced avatar", async () => {
  const person = await operations.personCreate.execute(context, { name: "Person", bio: "Bio" });
  await db.update(people).set({ avatar: "old.webp" }).where(eq(people.id, person.id));
  const remove = vi.spyOn(images, "deleteImage").mockResolvedValue();
  await operations.personUpdate.execute(context, { id: person.id, avatar: { kind: "clear" } });
  expect(remove).toHaveBeenCalledWith("old.webp");
  expect((await operations.personGet.execute(context, { id: person.id })).avatar).toBeNull();
});
it("adds and removes gallery images within their owning project", async () => {
  const project = await operations.projectCreate.execute(context, {
    name: "Project",
    description: "Description",
  });
  vi.spyOn(publicImages, "fetchPublicImage").mockResolvedValue(Buffer.from("mocked image"));
  vi.spyOn(images, "processAndSaveCoverImage").mockResolvedValue("gallery.webp");
  const remove = vi.spyOn(images, "deleteImage").mockResolvedValue();
  const added = await operations.projectGalleryAdd.execute(context, {
    id: project.id,
    image: { kind: "url", url: "https://example.com/gallery.png" },
  });
  expect(operations.projectGalleryAdd.output.safeParse(added).success).toBe(true);
  expect((await operations.projectGet.execute(context, { id: project.id })).images).toHaveLength(1);
  await operations.projectGalleryRemove.execute(context, {
    id: project.id,
    imageId: added.id,
    confirm: true,
  });
  expect(remove).toHaveBeenCalledWith("gallery.webp");
});

it("leaves fields unchanged when an image fetch fails", async () => {
  const person = await operations.personCreate.execute(context, {
    name: "Person",
    bio: "Original",
  });
  vi.spyOn(publicImages, "fetchPublicImage").mockRejectedValue(new Error("Image unavailable"));
  await expect(
    operations.personUpdate.execute(context, {
      id: person.id,
      bio: "Changed",
      avatar: { kind: "url", url: "https://example.com/image.png" },
    }),
  ).rejects.toThrow("Image unavailable");
  expect((await operations.personGet.execute(context, { id: person.id })).bio).toBe("Original");
});
it("validates technology assignments before changing company fields", async () => {
  const company = await operations.companyCreate.execute(context, {
    name: "Company",
    description: "Original",
  });
  await expect(
    operations.companyUpdate.execute(context, {
      id: company.id,
      description: "Changed",
      technologyIds: [987654321],
    }),
  ).rejects.toThrow("technologies do not exist");
  expect((await operations.companyGet.execute(context, { id: company.id })).description).toBe(
    "Original",
  );
});

it("rejects missing evidence jobs before saving company fields", async () => {
  const technology = await operations.technologyCreate.execute(context, {
    name: "TypeScript",
    category: "language",
  });
  const company = await operations.companyCreate.execute(context, {
    name: "Company",
    description: "Original",
    technologyIds: [technology.id],
  });
  await expect(
    operations.companyUpdate.execute(context, {
      id: company.id,
      description: "Changed",
      evidenceGroups: [
        { technologyIds: [technology.id], jobIds: [987654321], sourceType: "manual" },
      ],
    }),
  ).rejects.toThrow("Evidence job does not exist");
  expect((await operations.companyGet.execute(context, { id: company.id })).description).toBe(
    "Original",
  );
});
