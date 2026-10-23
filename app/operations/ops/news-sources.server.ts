import {
  createIfAbsent,
  recordIdentity,
  identityKey,
  normalizeIdentityUrl,
} from "../creation.server";
import { listInput, page, collectionPage } from "../listing";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { deleteInput } from "../fields";
import { eventSyncInput, eventSyncAllInput } from "../contracts/events";
import { asyncSyncOutput } from "../contracts/importers";
import {
  newsSourceCreateInput,
  newsSourceUpdateInput,
  newsSourceOutput,
  newsSyncOutput,
  newsSyncAllOutput,
  newsFeedTestInput,
  newsFeedPreviewOutput,
} from "../contracts/news";
import {
  getAllNewsImportSources,
  getNewsSourceById,
  createNewsImportSource,
  updateNewsImportSource,
  deleteNewsImportSource,
  syncNewsSource,
  syncAllNewsSources,
} from "~/lib/news-importers/sync.server";
import { previewNewsFeed } from "~/lib/news-importers/feed-preview.server";
import { startAsyncSync } from "~/lib/async-syncs.server";
async function requireSource(id: number) {
  const source = await getNewsSourceById(id);
  if (!source) throw new NotFoundError("News source not found");
  return source;
}
export const newsSourceOperations = {
  newsSourceList: defineOperation({
    name: "newsSourceList",
    area: "news",
    risk: "read",
    access: "admin",
    summary: "List news import sources.",
    description:
      "Return RSS/custom source URLs, filtering options, enabled state, and last-sync results.",
    input: listInput(["createdAt", "name"]),
    output: page(newsSourceOutput),
    examples: [{ title: "All sources", input: {} }],
    run: async (ctx, input) =>
      toPlain(
        collectionPage(await getAllNewsImportSources(), input, {
          createdAt: (row) => row.createdAt,
          name: (row) => row.name,
          sourceUrl: (row) => row.sourceUrl,
        }),
      ),
  }),
  newsSourceCreate: defineOperation({
    name: "newsSourceCreate",
    area: "news",
    risk: "write",
    access: "admin",
    summary: "Create a news import source.",
    description:
      "Store source and keyword configuration without fetching it. Use newsSourceTestFeed for an SSRF-guarded preview and newsSourceSync to import. Set ifNotExists to return an existing record by source type and canonical feed URL. Existing records are unchanged and return created:false; new records return created:true.",
    input: newsSourceCreateInput,
    output: newsSourceOutput.extend({ created: z.boolean() }).strict(),
    examples: [
      {
        title: "Add feed",
        input: { name: "News", sourceType: "rss", sourceUrl: "https://example.com/feed.xml" },
      },
    ],
    run: (ctx, { ifNotExists, ...input }) =>
      createIfAbsent(
        "news-source",
        ifNotExists,
        recordIdentity(
          identityKey(input.sourceType, normalizeIdentityUrl(input.sourceUrl)),
          getAllNewsImportSources,
          (row) =>
            row.sourceType === input.sourceType &&
            normalizeIdentityUrl(row.sourceUrl) === normalizeIdentityUrl(input.sourceUrl),
        ),
        async () => {
          return toPlain(await createNewsImportSource(input));
        },
      ),
  }),
  newsSourceUpdate: defineOperation({
    name: "newsSourceUpdate",
    area: "news",
    risk: "write",
    access: "admin",
    summary: "Update a news import source.",
    description:
      "Patch supplied configuration fields, including enabled state and keyword filters. No fetch runs.",
    input: newsSourceUpdateInput,
    output: newsSourceOutput,
    examples: [{ title: "Disable feed", input: { id: 1, enabled: false } }],
    run: async (_ctx, { id, ...fields }) => {
      await requireSource(id);
      await updateNewsImportSource(id, fields);
      return toPlain(await requireSource(id));
    },
  }),
  newsSourceDelete: defineOperation({
    name: "newsSourceDelete",
    area: "news",
    risk: "destructive",
    access: "admin",
    summary: "Delete a news source and its imported items.",
    description:
      "Delete associated news records and unreferenced cover images before removing the source. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true) }).strict(),
    examples: [{ title: "Delete source", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => {
      await requireSource(id);
      await deleteNewsImportSource(id);
      return { deleted: true as const };
    },
  }),
  newsSourceTestFeed: defineOperation({
    name: "newsSourceTestFeed",
    area: "news",
    risk: "external",
    access: "admin",
    summary: "Preview a news RSS or Atom feed.",
    description:
      "Supply a stored source id or a sourceUrl. Fetch through the public-address guard and return parsed items with keyword matches without saving them. Explicit preview options override stored values. Requires confirm: true.",
    input: newsFeedTestInput,
    output: newsFeedPreviewOutput,
    examples: [
      {
        title: "Preview feed",
        input: { sourceUrl: "https://example.com/feed.xml", confirm: true },
      },
    ],
    run: async (ctx, input) => {
      const source = input.id ? await requireSource(input.id) : null;
      return previewNewsFeed(
        input.sourceUrl ?? source!.sourceUrl,
        input.excerptMode ?? source?.excerptMode ?? "description",
        input.keywords === undefined ? (source?.keywords ?? null) : input.keywords,
      );
    },
  }),
  newsSourceSync: defineOperation({
    name: "newsSourceSync",
    area: "news",
    risk: "external",
    access: "admin",
    summary: "Sync one news source.",
    description:
      "Fetch and import news using source filters and the existing importer. Requires confirm: true. Set async to poll a background run with asyncSyncGet.",
    input: eventSyncInput,
    output: z.union([newsSyncOutput, asyncSyncOutput]),
    examples: [{ title: "Sync source", input: { id: 1, confirm: true } }],
    run: async (ctx, input) => {
      const source = await requireSource(input.id);
      return input.async
        ? startAsyncSync(
            [
              {
                type: "news",
                sourceId: source.id,
                name: source.name,
                run: () => syncNewsSource(source.id),
              },
            ],
            ctx.actor,
          )
        : syncNewsSource(source.id);
    },
  }),
  newsSourceSyncAll: defineOperation({
    name: "newsSourceSyncAll",
    area: "news",
    risk: "external",
    access: "admin",
    summary: "Sync every enabled news source.",
    description:
      "Skip disabled sources and return aggregate import counts. Requires confirm: true. Set async to return a run ID and poll asyncSyncGet.",
    input: eventSyncAllInput,
    output: z.union([newsSyncAllOutput, asyncSyncOutput]),
    examples: [{ title: "Sync all", input: { confirm: true } }],
    run: async (ctx, input) =>
      input.async
        ? startAsyncSync(
            (await getAllNewsImportSources())
              .filter((source) => source.enabled)
              .map((source) => ({
                type: "news" as const,
                sourceId: source.id,
                name: source.name,
                run: () => syncNewsSource(source.id),
              })),
            ctx.actor,
          )
        : syncAllNewsSources(),
  }),
};
