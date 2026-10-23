import { listInput } from "../listing";
import { z } from "zod";
import { newsTypes, newsStatuses, newsSourceTypes, excerptModes } from "../fields";
export const newsOutput = z
  .object({
    id: z.number(),
    slug: z.string(),
    type: z.enum(newsTypes),
    title: z.string(),
    externalUrl: z.string().nullable(),
    sourceName: z.string().nullable(),
    sourceEntityUrl: z.string().nullable(),
    content: z.string(),
    excerpt: z.string().nullable(),
    coverImage: z.string().nullable(),
    publishedAt: z.iso.datetime().nullable(),
    status: z.enum(newsStatuses),
    sourceId: z.number().nullable(),
    sourceItemId: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const newsSourceOutput = z
  .object({
    id: z.number(),
    name: z.string(),
    sourceType: z.enum(newsSourceTypes),
    sourceUrl: z.string(),
    sourceIdentifier: z.string().nullable(),
    keywords: z.string().nullable(),
    useGlobalKeywords: z.boolean(),
    useCompanyNameFilter: z.boolean(),
    excerptMode: z.enum(excerptModes),
    entityUrl: z.string().nullable(),
    enabled: z.boolean(),
    lastSyncAt: z.iso.datetime().nullable(),
    lastSyncStatus: z.string().nullable(),
    lastSyncError: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
import {
  text,
  nullableText,
  nullableUrl,
  url,
  id,
  confirm,
  imageInput,
  dateTime,
  updateContract,
  pagination,
} from "../fields";
export const newsFields = {
  title: text("title", 500),
  content: text("content"),
  excerpt: nullableText().optional(),
  status: z.enum(newsStatuses).optional(),
  externalUrl: nullableUrl().optional(),
  sourceName: nullableText(500).optional(),
  sourceEntityUrl: nullableUrl().optional(),
  publishedAt: dateTime.nullable().optional(),
  coverImage: imageInput.optional(),
};
export const newsArticleCreateInput = z
  .object({
    ...newsFields,
    content: z.string().trim().max(100000),
    type: z.enum(newsTypes).default("article"),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.type === "article" && !input.content)
      ctx.addIssue({ code: "custom", path: ["content"], message: "content is required" });
    if (input.type === "link" && !input.externalUrl)
      ctx.addIssue({ code: "custom", path: ["externalUrl"], message: "URL is required for links" });
  });
export const newsUpdateInput = updateContract(z.object(newsFields).partial().shape);
export const newsLinkSubmitInput = z
  .object({
    url: url(),
    title: text("title", 500).optional(),
    excerpt: nullableText().optional(),
    sourceName: nullableText(500).optional(),
    confirm,
  })
  .strict();
export const newsListInput = listInput(["createdAt", "updatedAt", "title", "publishedAt"])
  .extend({
    status: z.enum(newsStatuses).optional(),
    sourceId: id().nullable().optional(),
    type: z.enum(newsTypes).optional(),
  })
  .strict();
export const newsSourceFields = {
  name: text("name", 300),
  sourceType: z.enum(newsSourceTypes),
  sourceUrl: url(),
  sourceIdentifier: nullableText(1000).optional(),
  keywords: nullableText(10000).optional(),
  useGlobalKeywords: z.boolean().optional(),
  useCompanyNameFilter: z.boolean().optional(),
  excerptMode: z.enum(excerptModes).optional(),
  entityUrl: nullableUrl().optional(),
  enabled: z.boolean().optional(),
};
export const newsSourceCreateInput = z.object(newsSourceFields).strict();
export const newsSourceUpdateInput = updateContract(z.object(newsSourceFields).partial().shape);
export const newsFeedTestInput = z
  .object({
    id: id().optional(),
    sourceUrl: url().optional(),
    keywords: nullableText(10000).optional(),
    excerptMode: z.enum(excerptModes).optional(),
    confirm,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.id && !value.sourceUrl)
      ctx.addIssue({ code: "custom", message: "Supply id or sourceUrl" });
  });
export const newsFeedPreviewOutput = z
  .object({
    items: z.array(
      z
        .object({
          title: z.string(),
          url: z.string(),
          excerpt: z.string().nullable(),
          publishedAt: z.string().nullable(),
          matched: z.boolean(),
        })
        .strict(),
    ),
    totalCount: z.number(),
    matchedCount: z.number(),
    filteredCount: z.number(),
  })
  .strict();
export const newsSyncOutput = z
  .object({
    success: z.boolean(),
    error: z.string().optional(),
    added: z.number(),
    updated: z.number(),
    filtered: z.number(),
    totalPublished: z.number(),
  })
  .strict();
export const newsSyncAllOutput = z
  .object({
    sourcesTotal: z.number(),
    sourcesSucceeded: z.number(),
    sourcesFailed: z.number(),
    added: z.number(),
    updated: z.number(),
    filtered: z.number(),
    errors: z.array(z.string()),
  })
  .strict();
