import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { companies, technologyAssignments, technologyEvidence } from "~/db/schema";
import { operationCatalog as ops } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { NotFoundError, ForbiddenError } from "~/operations/errors";
import * as images from "~/lib/images.server";
import * as publicImages from "~/lib/public-image-fetch.server";
import { receiveImageUpload } from "~/lib/mcp-image-uploads.server";

const ctx = adminContext(1);
afterEach(() => vi.restoreAllMocks());
it("reports missing IDs instead of successful removals", async () => {
  for (const [operation, input] of [
    [ops.discordDestinationRemove, { id: 999, confirm: true }],
    [ops.discordUndo, { id: 999, confirm: true }],
    [ops.discordUndoBatch, { batchId: "missing", confirm: true }],
    [ops.themeShareDelete, { id: "a".repeat(32), confirm: true }],
    [ops.imageClear, { type: "company", id: 999, role: "icon", confirm: true }],
  ] as const)
    await expect(operation.execute(ctx, input)).rejects.toBeInstanceOf(NotFoundError);
  const destination = await ops.discordDestinationAdd.execute(ctx, {
    type: "events",
    guildId: "123",
    guildName: "Guild",
    channelId: "456",
    channelName: "Channel",
  });
  expect(
    await ops.discordDestinationRemove.execute(ctx, { id: destination.id, confirm: true }),
  ).toEqual({ removed: true });
  await expect(
    ops.discordDestinationRemove.execute(ctx, { id: destination.id, confirm: true }),
  ).rejects.toBeInstanceOf(NotFoundError);
  await expect(
    ops.siteExport.execute({ ...ctx, scopes: new Set(["read"]) }, {}),
  ).rejects.toBeInstanceOf(ForbiddenError);
});
it("persists equivalent settings through the complete and granular operations", async () => {
  await ops.siteConfigSave.execute(ctx, {
    sections: { jobs: false },
    comments: { products: false },
    newsGlobalKeywords: ["local"],
    botToken: "private-token",
    confirm: true,
  });
  const coarse = await ops.siteConfigGet.execute(ctx, {});
  await ops.siteConfigSave.execute(ctx, {
    sections: { jobs: true },
    comments: { products: true },
    newsGlobalKeywords: [],
    botToken: null,
    confirm: true,
  });
  await ops.siteSectionVisibilitySet.execute(ctx, { values: { jobs: false } });
  await ops.siteCommentVisibilitySet.execute(ctx, { values: { products: false } });
  await ops.newsGlobalKeywordsSet.execute(ctx, { keywords: ["local"] });
  await ops.discordConfigSet.execute(ctx, { botToken: "private-token", confirm: true });
  expect(await ops.siteConfigGet.execute(ctx, {})).toEqual(coarse);
});
it("persists the same technology assignments and evidence through both interfaces", async () => {
  const company = await ops.companyCreate.execute(ctx, {
    name: "Company",
    description: "Description",
  });
  const tech = await ops.technologyCreate.execute(ctx, {
    name: "TypeScript",
    category: "language",
  });
  const groups = [
    {
      technologyIds: [tech.id],
      sourceType: "manual" as const,
      sourceUrl: "https://example.com/tech",
      lastVerified: "2026-10",
      excerptText: "TypeScript",
    },
  ];
  async function state() {
    return {
      assignments: await db
        .select({
          technologyId: technologyAssignments.technologyId,
          contentId: technologyAssignments.contentId,
          source: technologyAssignments.source,
          sourceUrl: technologyAssignments.sourceUrl,
          lastVerified: technologyAssignments.lastVerified,
        })
        .from(technologyAssignments),
      evidence: await db
        .select({
          sourceType: technologyEvidence.sourceType,
          sourceUrl: technologyEvidence.sourceUrl,
          excerptText: technologyEvidence.excerptText,
          lastVerified: technologyEvidence.lastVerified,
        })
        .from(technologyEvidence),
    };
  }
  await ops.companyUpdate.execute(ctx, {
    id: company.id,
    technologyIds: [tech.id],
    evidenceGroups: groups,
  });
  const coarse = await state();
  await ops.companyUpdate.execute(ctx, { id: company.id, technologyIds: [] });
  await ops.companyTechnologiesSet.execute(ctx, { id: company.id, technologyIds: [tech.id] });
  await ops.companyTechnologyEvidenceSet.execute(ctx, { id: company.id, groups });
  expect(await state()).toEqual(coarse);
});
it("uses the same image lifecycle for entity fields, URL commands and uploaded bytes", async () => {
  const company = await ops.companyCreate.execute(ctx, {
    name: "Company",
    description: "Description",
  });
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#123456" } })
    .png()
    .toBuffer();
  vi.spyOn(publicImages, "fetchPublicImage").mockResolvedValue(bytes);
  const process = vi.spyOn(images, "processAndSaveIconImage").mockResolvedValue("new.webp");
  const remove = vi.spyOn(images, "deleteImage").mockResolvedValue();
  const reset = () =>
    db.update(companies).set({ logo: "old.webp" }).where(eq(companies.id, company.id));
  await reset();
  await ops.companyUpdate.execute(ctx, {
    id: company.id,
    logo: { kind: "url", url: "https://example.com/logo.png", confirm: true },
  });
  const { updatedAt: _time, ...coarse } = await ops.companyGet.execute(ctx, { id: company.id });
  await reset();
  await ops.imageSetFromUrl.execute(ctx, {
    type: "company",
    id: company.id,
    role: "icon",
    url: "https://example.com/logo.png",
    confirm: true,
  });
  const { updatedAt: _secondTime, ...granular } = await ops.companyGet.execute(ctx, {
    id: company.id,
  });
  expect(granular).toEqual(coarse);
  const upload = await ops.imageUploadPrepare.execute(ctx, {
    contentType: "image/png",
    size: bytes.length,
  });
  await receiveImageUpload(
    upload.uploadId,
    new Request(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers,
      body: new Uint8Array(bytes),
    }),
  );
  await reset();
  await ops.imageAttach.execute(ctx, {
    type: "company",
    id: company.id,
    role: "icon",
    uploadId: upload.uploadId,
    confirm: true,
  });
  expect((await ops.companyGet.execute(ctx, { id: company.id })).logo).toBe(coarse.logo);
  expect(process).toHaveBeenCalledTimes(3);
  expect(remove.mock.calls.map((call) => call[0])).toEqual(["old.webp", "old.webp", "old.webp"]);
  await ops.companyUpdate.execute(ctx, { id: company.id, logo: { kind: "clear", confirm: true } });
  await reset();
  await ops.imageClear.execute(ctx, {
    type: "company",
    id: company.id,
    role: "icon",
    confirm: true,
  });
  expect((await ops.companyGet.execute(ctx, { id: company.id })).logo).toBeNull();
  await expect(
    ops.companyUpdate.execute(ctx, { id: company.id, logo: { kind: "clear" } }),
  ).rejects.toThrow("confirm");
});

it("publishes the same event state through the status operation and the edit contract", async () => {
  const event = await ops.eventCreate.execute(ctx, {
    title: "Event",
    description: "Description",
    link: "https://example.com/event",
    dates: [{ startDate: "2026-11-01", startTime: "18:00" }],
  });
  await ops.eventUpdate.execute(ctx, { id: event.id, importStatus: "published" });
  const { updatedAt: _coarseTime, ...coarse } = await ops.eventGet.execute(ctx, { id: event.id });
  await ops.eventImportHide.execute(ctx, { id: event.id });
  await ops.eventPublish.execute(ctx, { id: event.id });
  const { updatedAt: _granularTime, ...granular } = await ops.eventGet.execute(ctx, {
    id: event.id,
  });
  expect(granular).toEqual(coarse);
});
