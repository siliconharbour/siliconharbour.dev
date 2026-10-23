import { afterEach, expect, it, vi } from "vitest";
import { operationCatalog as operations } from "~/operations/catalog";
import { adminContext, publicContext } from "~/operations/context";
import * as newsletter from "~/lib/newsletter.server";
import * as discord from "~/lib/discord.server";
import { getDiscordConfig } from "~/lib/config.server";
import { consumeExportToken } from "~/lib/site-export.server";
import { action as deleteCommentAction } from "~/routes/api.comments.delete";
import { createComment, getCommentById } from "~/lib/comments.server";
import { createCompany } from "~/lib/companies.server";
import { postDiscordRoundup } from "~/lib/discord-roundup.server";
import { createImportSource } from "~/lib/job-importers/sync.server";
import * as sourceSync from "~/lib/job-importers/sync.server";
import { getSourceById } from "~/lib/job-importers/sync.server";
import * as publicImages from "~/lib/public-image-fetch.server";
import * as images from "~/lib/images.server";
vi.mock("~/lib/session.server", () => ({
  requireAdmin: async () => ({ user: { id: 1, role: "admin" } }),
}));
afterEach(() => vi.restoreAllMocks());
const context = adminContext(1);
it("validates all settings before saving and never returns the bot token", async () => {
  await operations.discordConfigSet.execute(context, { botToken: "private-bot-token" });
  const current = await operations.siteConfigGet.execute(context, {});
  expect(JSON.stringify(current)).not.toContain("private-bot-token");
  expect(current.discord).toMatchObject({ botTokenConfigured: true, botTokenMasked: "••••oken" });
  await expect(
    operations.siteConfigSave.execute(context, {
      sections: { ...current.sections, jobs: false },
      comments: current.comments,
      newsGlobalKeywords: null,
      botToken: "x".repeat(501),
      confirm: true,
    }),
  ).rejects.toThrow();
  expect((await operations.siteConfigGet.execute(context, {})).sections.jobs).toBe(true);
  await operations.siteConfigSave.execute(context, {
    sections: { ...current.sections, jobs: false },
    comments: current.comments,
    newsGlobalKeywords: "local",
    confirm: true,
  });
  expect((await operations.siteConfigGet.execute(context, {})).sections.jobs).toBe(false);
  expect((await getDiscordConfig()).botToken).toBe("private-bot-token");
});
it("blocks newsletter live sends before contacting the provider when rollout is disabled", async () => {
  const send = vi
    .spyOn(newsletter, "sendNewsletterLive")
    .mockRejectedValue(new Error("must not send"));
  await expect(
    operations.newsletterCampaignSendLive.execute(context, {
      id: 1,
      confirm: true,
      confirmationSubject: "Community news",
    }),
  ).rejects.toThrow("disabled");
  expect(send).not.toHaveBeenCalled();
  await expect(operations.newsletterCampaignSendLive.execute(context, { id: 1 })).rejects.toThrow(
    "confirm: true",
  );
});
it("authorizes administrative reads inside their shared operations", async () => {
  const fetch = vi
    .spyOn(newsletter, "getNewsletterList")
    .mockRejectedValue(new Error("must not fetch"));
  await expect(operations.newsletterSubscriberList.execute(publicContext(), {})).rejects.toThrow(
    "Administrator",
  );
  await expect(operations.discordConfigGet.execute(publicContext(), {})).rejects.toThrow(
    "Administrator",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("deletes comments through the API action and shared moderation operation", async () => {
  const company = await createCompany({ name: "Company", description: "Description" });
  const comment = await createComment({
    contentType: "company",
    contentId: company.id,
    authorName: "Reader",
    content: "Comment",
  });
  const form = new FormData();
  form.set("commentId", String(comment.id));
  const result = await deleteCommentAction({
    request: new Request("https://example.com/api/comments/delete", { method: "POST", body: form }),
  } as Parameters<typeof deleteCommentAction>[0]);
  expect(result).toEqual({ success: true });
  expect(await getCommentById(comment.id)).toBeNull();
});
it("issues expiring single-use export capabilities", async () => {
  const now = new Date("2026-11-01T18:00:00Z");
  const prepared = await operations.siteExport.execute({ ...context, now: () => now }, {});
  const token = new URL(prepared.url).searchParams.get("token")!;
  expect(consumeExportToken(token, now)).toBe(true);
  expect(consumeExportToken(token, now)).toBe(false);
  const expired = await operations.siteExport.execute({ ...context, now: () => now }, {});
  expect(
    consumeExportToken(
      new URL(expired.url).searchParams.get("token")!,
      new Date(now.getTime() + 300001),
    ),
  ).toBe(false);
});
it("rejects unavailable Discord items before posting externally", async () => {
  await operations.discordConfigSet.execute(context, { botToken: "test-token" });
  await operations.discordDestinationAdd.execute(context, {
    type: "jobs",
    guildId: "123",
    guildName: "Guild",
    channelId: "456",
    channelName: "jobs",
  });
  const send = vi
    .spyOn(discord, "postMessage")
    .mockResolvedValue({ success: true, messageId: "123" });
  await expect(postDiscordRoundup("jobs", [987654321])).rejects.toThrow("no longer available");
  expect(send).not.toHaveBeenCalled();
});
it("returns declared outputs for directory and importer status reads", async () => {
  for (const operation of [
    operations.dashboardCounts,
    operations.reviewQueueList,
    operations.githubLocationBulkStatus,
    operations.githubFollowingStatus,
    operations.importerTypeList,
    operations.asyncSyncList,
  ]) {
    const result = await operation.execute(context, {});
    expect(operation.output.safeParse(result).success, operation.name).toBe(true);
  }
});
it("returns a pollable async sync with mocked source I/O", async () => {
  const company = await createCompany({ name: "Company", description: "Description" });
  const id = await createImportSource({
    companyId: company.id,
    sourceType: "greenhouse",
    sourceIdentifier: "example",
  });
  const sync = vi.spyOn(sourceSync, "syncJobs").mockResolvedValue({
    success: true,
    added: 1,
    updated: 0,
    removed: 0,
    reactivated: 0,
    totalActive: 1,
  });
  const run = await operations.jobSourceSync.execute(context, { id, confirm: true, async: true });
  expect(operations.jobSourceSync.output.safeParse(run).success).toBe(true);
  expect("id" in run).toBe(true);
  if (!("id" in run)) throw new Error("Expected async run");
  const polled = await operations.asyncSyncGet.execute(context, { id: run.id });
  expect(operations.asyncSyncGet.output.safeParse(polled).success).toBe(true);
  expect(sync).toHaveBeenCalledWith(id);
  expect(await getSourceById(id)).not.toBeNull();
});
it("imports guarded directory logos without exposing arbitrary server fetches", async () => {
  vi.spyOn(publicImages, "fetchPublicImage").mockResolvedValue(Buffer.from("mocked image"));
  vi.spyOn(images, "processAndSaveIconImageWithPadding").mockResolvedValue("imported-logo.webp");
  const result = await operations.directoryImport.execute(context, {
    source: "technl",
    downloadLogos: true,
    companies: [
      {
        name: "Imported",
        description: "Description",
        website: "https://example.com",
        logoUrl: "https://example.com/logo.png",
      },
    ],
  });
  expect(result.errors).toEqual([]);
  expect(await operations.companyGet.execute(context, { name: "Imported" })).toMatchObject({
    visible: false,
    technl: true,
    logo: "imported-logo.webp",
  });
});

it("masks the entire value of unusually short configured tokens", async () => {
  for (const token of ["abc", "12345678"]) {
    await operations.discordConfigSet.execute(context, { botToken: token });
    expect(await operations.discordConfigGet.execute(context, {})).toEqual({
      botTokenConfigured: true,
      botTokenMasked: "Configured",
    });
  }
});

it("requires the exact campaign subject before a live send", async () => {
  await newsletter.setNewsletterFlags({ publicSignup: false, liveSend: true });
  const list = {
    id: 7,
    name: "Community",
    slug: "siliconharbour",
    fromDomain: "example.com",
    fromAddress: "hello@example.com",
    description: null,
    createdAt: "2026-10-23T00:00:00Z",
  };
  const campaign: newsletter.Campaign = {
    id: 1,
    subject: "Community news",
    bodyMarkdown: "News",
    fromAddress: "hello@example.com",
    fromName: null,
    audienceType: "list",
    audienceId: 7,
    audienceData: null,
    status: "draft",
    createdAt: "2026-10-23T00:00:00Z",
    sentAt: null,
    lastError: null,
  };
  vi.spyOn(newsletter, "getNewsletterList").mockResolvedValue(list);
  vi.spyOn(newsletter, "getNewsletterCampaign").mockResolvedValue(campaign);
  const send = vi
    .spyOn(newsletter, "sendNewsletterLive")
    .mockResolvedValue({ ...campaign, status: "sent" });
  await expect(
    operations.newsletterCampaignSendLive.execute(context, { id: 1, confirm: true }),
  ).rejects.toThrow("confirmationSubject");
  await expect(
    operations.newsletterCampaignSendLive.execute(context, {
      id: 1,
      confirm: true,
      confirmationSubject: "wrong",
    }),
  ).rejects.toThrow("exact campaign subject");
  expect(send).not.toHaveBeenCalled();
  await operations.newsletterCampaignSendLive.execute(context, {
    id: 1,
    confirm: true,
    confirmationSubject: campaign.subject,
  });
  expect(send).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith(1, 7);
});
