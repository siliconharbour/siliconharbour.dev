import { afterEach, expect, it } from "vitest";
import { existsSync, writeFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import {
  companies,
  people,
  technologyAssignments,
  technologyEvidence,
  jobImportSources,
  jobs,
} from "~/db/schema";
import { operationCatalog as ops } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { getImagePath } from "~/lib/images.server";
import { isBlocked } from "~/lib/import-blocklist.server";

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { force: true });
});
const now = new Date("2026-10-23T12:00:00Z");
function context(via: "admin-ui" | "mcp") {
  return { ...adminContext(1, via), now: () => now };
}
function image() {
  const filename = `${randomUUID()}.webp`;
  const path = getImagePath(filename);
  writeFileSync(path, "retained image");
  paths.push(path);
  return filename;
}

it.each(["admin-ui", "mcp"] as const)(
  "restores company identity, relationships and images through %s",
  async (via) => {
    const ctx = context(via);
    const company = await ops.companyCreate.execute(ctx, {
      name: "Company",
      description: "Description",
      website: "example.com",
      technl: true,
      visible: true,
    });
    const logo = image();
    await db.update(companies).set({ logo }).where(eq(companies.id, company.id));
    const technology = await ops.technologyCreate.execute(ctx, {
      name: "TypeScript",
      category: "language",
    });
    const [assignment] = await db
      .insert(technologyAssignments)
      .values({
        technologyId: technology.id,
        contentType: "company",
        contentId: company.id,
        source: "Survey",
      })
      .returning();
    await db
      .insert(technologyEvidence)
      .values({ technologyAssignmentId: assignment.id, sourceUrl: "https://example.com/evidence" });
    const [source] = await db
      .insert(jobImportSources)
      .values({ companyId: company.id, sourceType: "greenhouse", sourceIdentifier: "company" })
      .returning();
    const [job] = await db
      .insert(jobs)
      .values({
        companyId: company.id,
        sourceId: source.id,
        slug: "job",
        title: "Developer",
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .returning();
    const original = await ops.companyGet.execute(ctx, { id: company.id });
    const rejected = await ops.companyReject.execute(ctx, { id: company.id, confirm: true });
    expect(existsSync(getImagePath(logo))).toBe(true);
    expect(await isBlocked("technl", "https://example.com/")).toBe(true);
    expect((await ops.companyList.execute(ctx, {})).items).toEqual([]);
    expect((await ops.companyPublicList.execute(ctx, {})).items).toEqual([]);
    await expect(ops.companyGet.execute(ctx, { id: company.id })).rejects.toThrow("not found");
    await expect(ops.companyApprove.execute(ctx, { id: company.id })).rejects.toThrow("not found");
    await expect(
      ops.imageClear.execute(ctx, { type: "company", id: company.id, role: "icon", confirm: true }),
    ).rejects.toThrow("not found");
    expect((await ops.rejectedRecordList.execute(ctx, {})).items[0].entityId).toBe(company.id);
    await ops.rejectedRecordRestore.execute(ctx, { id: rejected.restoreId, confirm: true });
    expect(await ops.companyGet.execute(ctx, { id: company.id })).toEqual(original);
    expect(await db.select().from(technologyAssignments).get()).toMatchObject(assignment);
    expect(await db.select().from(technologyEvidence).get()).toMatchObject({
      technologyAssignmentId: assignment.id,
    });
    expect(await db.select().from(jobImportSources).get()).toEqual(source);
    expect(await db.select().from(jobs).get()).toEqual(job);
    expect(existsSync(getImagePath(logo))).toBe(true);
    expect(await isBlocked("technl", "example.com")).toBe(false);
    const discarded = await ops.companyReject.execute(ctx, { id: company.id, confirm: true });
    await ops.rejectedRecordDelete.execute(ctx, { id: discarded.restoreId, confirm: true });
    expect(await db.select().from(technologyAssignments)).toEqual([]);
    expect(await db.select().from(technologyEvidence)).toEqual([]);
    expect(await db.select().from(jobImportSources)).toEqual([]);
    expect(await db.select().from(jobs)).toEqual([]);
    expect(existsSync(getImagePath(logo))).toBe(false);
  },
);

it("expires restore access while retaining explicit cleanup and its import block", async () => {
  const ctx = context("mcp");
  const person = await ops.personCreate.execute(ctx, {
    name: "Person",
    bio: "Bio",
    externalLinks: { github: "@Example" },
  });
  const avatar = image();
  await db.update(people).set({ avatar }).where(eq(people.id, person.id));
  const original = await ops.personGet.execute(ctx, { id: person.id });
  const first = await ops.personReject.execute(ctx, { id: person.id, confirm: true });
  await ops.rejectedRecordRestore.execute(ctx, { id: first.restoreId, confirm: true });
  expect(await ops.personGet.execute(ctx, { id: person.id })).toEqual(original);
  const rejected = await ops.personReject.execute(ctx, { id: person.id, confirm: true });
  const expired = { ...ctx, now: () => new Date(now.getTime() + 8 * 86400000) };
  await expect(
    ops.rejectedRecordRestore.execute(expired, { id: rejected.restoreId, confirm: true }),
  ).rejects.toThrow("expired");
  await ops.rejectedRecordDelete.execute(expired, { id: rejected.restoreId, confirm: true });
  expect(await db.select().from(people).get()).toBeUndefined();
  expect(existsSync(getImagePath(avatar))).toBe(false);
  expect(await isBlocked("github", "example")).toBe(true);
  await expect(
    ops.rejectedRecordDelete.execute(expired, { id: rejected.restoreId, confirm: true }),
  ).rejects.toThrow("not found");
});
