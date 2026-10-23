import { eventSyncOutput } from "./events";
import { jobSyncOutput } from "./jobs";
import { newsSyncOutput } from "./news";
import { z } from "zod";
export const asyncSyncOutput = z
  .object({
    id: z.string(),
    status: z.enum(["running", "completed", "failed"]),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().optional(),
    durationMs: z.number().optional(),
    startedBy: z.number().int().positive().nullable(),
    via: z.enum(["mcp", "admin-ui"]).nullable(),
    error: z.string().optional(),
    steps: z.array(
      z
        .object({
          type: z.enum(["event", "job", "news"]),
          sourceId: z.number(),
          name: z.string(),
          status: z.enum(["running", "completed", "failed"]),
          startedAt: z.iso.datetime(),
          finishedAt: z.iso.datetime().optional(),
          durationMs: z.number().optional(),
          result: z.union([eventSyncOutput, jobSyncOutput, newsSyncOutput]).optional(),
          error: z.string().optional(),
        })
        .strict(),
    ),
    total: z.number(),
    completed: z.number(),
    failed: z.number(),
    current: z
      .object({ type: z.enum(["event", "job", "news"]), sourceId: z.number(), name: z.string() })
      .strict()
      .optional(),
  })
  .strict();
import { text, nullableText, nullableUrl, confirm, url, email } from "../fields";
export const directorySource = z.enum(["technl", "genesis", "bounce"]);
export const scrapedCompany = z
  .object({
    name: text("name", 500),
    description: nullableText().default(null),
    website: nullableUrl().default(null),
    email: nullableText(320).pipe(email().nullable()).default(null),
    logoUrl: nullableUrl().default(null),
    categories: z.array(z.string().max(300)).max(100).default([]),
    sourceUrl: z.string().max(4096).default(""),
    sourceId: z.string().max(1000).default(""),
  })
  .strict();
export const directoryFetchInput = z.object({ source: directorySource, confirm }).strict();
export const directoryImportInput = z
  .object({
    source: directorySource,
    companies: z.array(scrapedCompany).min(1).max(1000),
    downloadLogos: z.boolean().default(false),
  })
  .strict();
export const directoryAdoptInput = z
  .object({
    source: directorySource,
    name: text("name", 500),
    companyWebsite: nullableUrl().optional(),
    field: z.enum(["website", "description", "email"]),
    value: text("value"),
  })
  .strict()
  .superRefine((input, ctx) => {
    const valid =
      input.field === "email"
        ? z.email().safeParse(input.value).success
        : input.field === "website"
          ? url().safeParse(input.value).success
          : true;
    if (!valid)
      ctx.addIssue({ code: "custom", path: ["value"], message: `Invalid ${input.field}` });
  });
export const importBatchOutput = z
  .object({ imported: z.array(z.string()), errors: z.array(z.string()) })
  .strict();
import { id, importJobStatuses, githubFollowingModes } from "../fields";
export const githubBasicUser = z
  .object({ login: text("login", 100), id: id(), avatar_url: url(), html_url: url() })
  .strict();
export const githubProfile = githubBasicUser
  .extend({
    name: z.string().nullable(),
    company: z.string().nullable(),
    bio: z.string().nullable(),
    blog: z.string().nullable(),
    location: z.string().nullable(),
    public_repos: z.number(),
    twitter_username: z.string().nullable(),
  })
  .strict();
export const githubImportInput = z
  .object({
    users: z.array(githubProfile).min(1).max(1000),
    downloadAvatars: z.boolean().default(false),
  })
  .strict();
export const githubSearchInput = z
  .object({ page: z.number().int().min(1).max(1000).default(1), confirm })
  .strict();
export const githubSearchOutput = z
  .object({
    users: z.array(githubProfile),
    total: z.number(),
    page: z.number(),
    rateLimit: z.object({ remaining: z.number(), limit: z.number(), reset: z.string() }).strict(),
  })
  .strict();
export const githubProgressOutput = z
  .object({
    status: z.enum(importJobStatuses),
    totalItems: z.number(),
    processedItems: z.number(),
    currentPage: z.number(),
    totalPages: z.number(),
    importedCount: z.number(),
    skippedCount: z.number(),
    blockedCount: z.number(),
    errorCount: z.number(),
    rateLimitRemaining: z.number().nullable(),
    rateLimitReset: z.string().nullable(),
    lastError: z.string().nullable(),
    lastActivity: z.string().nullable(),
    canResume: z.boolean(),
    waitingForRateLimit: z.boolean(),
  })
  .strict();
export const githubContinueInput = z
  .object({ downloadAvatars: z.boolean().default(true), confirm })
  .strict();
export const githubFollowingStartInput = z
  .object({
    username: text("username", 100).regex(/^[a-zA-Z0-9-]+$/),
    mode: z.enum(githubFollowingModes).default("following"),
    confirm,
  })
  .strict();
export const githubFollowingOutput = z
  .object({
    status: z.enum(importJobStatuses),
    sourceUsername: z.string().nullable(),
    mode: z.enum(githubFollowingModes).nullable(),
    totalUsers: z.number(),
    fetchedProfiles: z.number(),
    errorCount: z.number(),
    rateLimitRemaining: z.number().nullable(),
    rateLimitReset: z.string().nullable(),
    lastError: z.string().nullable(),
    canResume: z.boolean(),
    waitingForRateLimit: z.boolean(),
    users: z.array(githubBasicUser),
    profiles: z.array(githubProfile),
    errors: z.array(z.string()),
  })
  .strict();

export const directoryReviewOutput = z
  .object({
    existingNames: z.array(z.string()),
    existingWebsites: z.array(z.string()),
    hasSourceFlagNames: z.array(z.string()),
    hasSourceFlagWebsites: z.array(z.string()),
    blockedIds: z.array(z.string()),
    existingCompanyData: z.record(
      z.string(),
      z
        .object({
          website: z.string().nullable(),
          description: z.string(),
          email: z.string().nullable(),
          logo: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
