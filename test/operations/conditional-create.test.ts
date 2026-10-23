import { afterEach, expect, it, vi } from "vitest";
import { operationCatalog as ops } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { db } from "~/db";
import { companies, people } from "~/db/schema";
import * as publicImages from "~/lib/public-image-fetch.server";
import * as publicPages from "~/lib/public-fetch.server";
const ctx = adminContext(1);
afterEach(() => vi.restoreAllMocks());
it("coalesces concurrent conditional creates without merging companies by name", async () => {
  const input = {
    name: "Company",
    description: "Description",
    website: "example.com",
    ifNotExists: true,
  };
  const results = await Promise.all([
    ops.companyCreate.execute(ctx, input),
    ops.companyCreate.execute(ctx, input),
    ops.companyCreate.execute(ctx, input),
  ]);
  expect(new Set(results.map((row) => row.id)).size).toBe(1);
  expect(results.filter((row) => row.created)).toHaveLength(1);
  expect(await db.select().from(companies)).toHaveLength(1);
  const other = await ops.companyCreate.execute(ctx, {
    ...input,
    website: "different.example.com",
  });
  expect(other.created).toBe(true);
  expect(other.id).not.toBe(results[0].id);
  await expect(
    ops.companyCreate.execute(ctx, {
      name: "Company",
      description: "Description",
      ifNotExists: true,
    }),
  ).rejects.toThrow("stable identity");
  expect(await db.select().from(companies)).toHaveLength(2);
  await ops.companyReject.execute(ctx, { id: results[0].id, confirm: true });
  await expect(ops.companyCreate.execute(ctx, input)).rejects.toThrow("rejected");
  expect(await db.select().from(companies)).toHaveLength(2);
});
it("uses normalized stored identities and skips image work for existing records", async () => {
  const [existing] = await db
    .insert(companies)
    .values({
      name: "Stored",
      description: "Description",
      slug: "stored",
      website: "HTTPS://WWW.Example.COM/Path/",
    })
    .returning();
  const fetch = vi
    .spyOn(publicImages, "fetchPublicImage")
    .mockRejectedValue(new Error("must not fetch"));
  const result = await ops.companyCreate.execute(ctx, {
    name: "Changed",
    description: "Changed",
    website: "example.com/path",
    logo: { kind: "url", url: "https://example.com/logo.png", confirm: true },
    ifNotExists: true,
  });
  expect(result).toMatchObject({
    id: existing.id,
    name: "Stored",
    description: "Description",
    created: false,
  });
  expect(fetch).not.toHaveBeenCalled();
  const person = await ops.personCreate.execute(ctx, {
    name: "Person",
    bio: "Bio",
    github: "@Example",
    ifNotExists: true,
  });
  expect(
    await ops.personCreate.execute(ctx, {
      name: "Changed",
      bio: "Changed",
      github: "https://github.com/EXAMPLE/",
      ifNotExists: true,
    }),
  ).toMatchObject({ id: person.id, name: "Person", created: false });
  await ops.personReject.execute(ctx, { id: person.id, confirm: true });
  await expect(
    ops.personCreate.execute(ctx, {
      name: "Person",
      bio: "Bio",
      github: "example",
      ifNotExists: true,
    }),
  ).rejects.toThrow("rejected");
  expect(await db.select().from(people)).toHaveLength(1);
});
it("keeps events with different schedules distinct and matches the same local schedule", async () => {
  const input = {
    title: "Meetup",
    description: "Description",
    link: "https://example.com/meetup",
    dates: [{ startDate: "2026-11-01", startTime: "18:00" }],
    ifNotExists: true,
  };
  const first = await ops.eventCreate.execute(ctx, input);
  expect(first.created).toBe(true);
  expect(await ops.eventCreate.execute(ctx, input)).toMatchObject({ id: first.id, created: false });
  const other = await ops.eventCreate.execute(ctx, {
    ...input,
    dates: [{ startDate: "2026-11-08", startTime: "18:00" }],
  });
  expect(other.created).toBe(true);
  expect(other.id).not.toBe(first.id);
});
it("matches article content without using headlines alone and skips repeated news fetches", async () => {
  const input = { title: "News", content: "First article", ifNotExists: true };
  const article = await ops.newsArticleCreate.execute(ctx, input);
  expect(await ops.newsArticleCreate.execute(ctx, input)).toMatchObject({
    id: article.id,
    created: false,
  });
  expect(
    (await ops.newsArticleCreate.execute(ctx, { ...input, content: "Different article" })).created,
  ).toBe(true);
  const fetch = vi
    .spyOn(publicPages, "fetchPublicPage")
    .mockResolvedValue('<title>News link</title><meta name="description" content="Description">');
  const link = await ops.newsLinkSubmit.execute(ctx, {
    url: "https://example.com/news",
    ifNotExists: true,
    confirm: true,
  });
  expect(
    await ops.newsLinkSubmit.execute(ctx, {
      url: "https://example.com/news",
      ifNotExists: true,
      confirm: true,
    }),
  ).toMatchObject({ id: link.id, created: false });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  ["educationCreate", { website: "https://example.com/school" }],
  ["groupCreate", { website: "https://example.com/group" }],
  ["productCreate", { website: "https://example.com/product" }],
  ["projectCreate", { links: { website: "https://example.com/project" } }],
  ["technologyCreate", {}],
  ["jobCreate", {}],
  ["newsSourceCreate", {}],
  ["jobSearchImport", {}],
] as const)("%s returns the same persisted record when requested", async (name, identity) => {
  const operation = ops[name];
  const input = { ...operation.examples[0].input, ...identity, ifNotExists: true };
  const first = await operation.execute(ctx, input);
  const second = await operation.execute(ctx, input);
  expect(first.created).toBe(true);
  expect(second).toEqual({ ...first, created: false });
});

it("releases a failed conditional create so a retry can succeed", async () => {
  vi.spyOn(publicImages, "fetchPublicImage").mockRejectedValue(new Error("Offline"));
  const input = {
    name: "Company",
    description: "Description",
    website: "https://example.com",
    ifNotExists: true,
  };
  await expect(
    ops.companyCreate.execute(ctx, {
      ...input,
      logo: { kind: "url", url: "https://example.com/logo.png", confirm: true },
    }),
  ).rejects.toThrow("Offline");
  expect((await ops.companyCreate.execute(ctx, input)).created).toBe(true);
  expect(await db.select().from(companies)).toHaveLength(1);
});

it("coalesces the two job creation entry points for the same application URL", async () => {
  const fields = {
    title: "Developer",
    description: "Description",
    url: "https://example.com/job",
    ifNotExists: true,
  };
  const results = await Promise.all([
    ops.jobCreate.execute(ctx, fields),
    ops.jobSearchImport.execute(ctx, fields),
  ]);
  expect(new Set(results.map((row) => row.id)).size).toBe(1);
  expect(results.filter((row) => row.created)).toHaveLength(1);
});

it("reuses source identities before repeating provider validation", async () => {
  const eventImporters = await import("~/lib/event-importers/sync.server");
  const validate = vi
    .spyOn(eventImporters, "validateEventImportSourceConfig")
    .mockResolvedValue({ valid: true });
  const eventInput = { ...ops.eventSourceCreate.examples[0].input, ifNotExists: true };
  const event = await ops.eventSourceCreate.execute(ctx, eventInput);
  expect(await ops.eventSourceCreate.execute(ctx, eventInput)).toEqual({
    ...event,
    created: false,
  });
  expect(validate).toHaveBeenCalledTimes(1);
  const company = await ops.companyCreate.execute(ctx, {
    name: "Company",
    description: "Description",
  });
  const jobImporters = await import("~/lib/job-importers");
  const validateJob = vi
    .spyOn(jobImporters.getImporter("greenhouse"), "validateConfig")
    .mockResolvedValue({ valid: true });
  const jobInput = {
    companyId: company.id,
    sourceType: "greenhouse",
    sourceIdentifier: "company",
    confirm: true,
    ifNotExists: true,
  };
  const job = await ops.jobSourceCreate.execute(ctx, jobInput);
  expect(await ops.jobSourceCreate.execute(ctx, jobInput)).toEqual({ ...job, created: false });
  expect(validateJob).toHaveBeenCalledTimes(1);
});

it.each([
  {
    label: "recurring",
    dates: undefined,
    recurrenceRule: "FREQ=WEEKLY;BYDAY=SU",
    recurrenceStart: "2026-11-01",
    defaultStartTime: "18:00",
  },
  {
    label: "period",
    timeMode: "period",
    dates: [
      { startDate: "2026-11-01", startTime: "18:00", endDate: "2026-11-03", endTime: "18:00" },
    ],
  },
])("matches the canonical stored $label event schedule", async ({ label: _label, ...schedule }) => {
  const input = { ...ops.eventCreate.examples[0].input, ...schedule, ifNotExists: true };
  const first = await ops.eventCreate.execute(ctx, input);
  expect(await ops.eventCreate.execute(ctx, input)).toEqual({ ...first, created: false });
});
