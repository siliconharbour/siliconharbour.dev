import { and, eq, isNull, gte, lte } from "drizzle-orm";
import { events, news, comments, importBlocklist } from "~/db/schema";
import { getEventById } from "./events.server";
import { sqlPage } from "./sql-page.server";
import type { ListInput } from "~/operations/listing";
import type { z } from "zod";
import type { eventListInput } from "~/operations/contracts/events";
import type { newsListInput } from "~/operations/contracts/news";
import type { commentListInput } from "~/operations/contracts/comments";

export async function listEvents(input: z.output<typeof eventListInput>) {
  const rows = sqlPage(
    events,
    input,
    [events.title, events.slug, events.description, events.location, events.organizer],
    { title: events.title, createdAt: events.createdAt, updatedAt: events.updatedAt },
    and(
      input.importStatus === undefined
        ? undefined
        : input.importStatus === null
          ? isNull(events.importStatus)
          : eq(events.importStatus, input.importStatus),
      input.sourceId === undefined
        ? undefined
        : input.sourceId === null
          ? isNull(events.importSourceId)
          : eq(events.importSourceId, input.sourceId),
    ),
  );
  const items = await Promise.all(rows.items.map((row) => getEventById(row.id)));
  return { ...rows, items: items.filter((row): row is NonNullable<typeof row> => row !== null) };
}
export function listNews(input: z.output<typeof newsListInput>) {
  return sqlPage(
    news,
    input,
    [news.title, news.slug, news.content, news.excerpt, news.externalUrl, news.sourceName],
    {
      title: news.title,
      createdAt: news.createdAt,
      updatedAt: news.updatedAt,
      publishedAt: news.publishedAt,
    },
    and(
      input.status === undefined ? undefined : eq(news.status, input.status),
      input.type === undefined ? undefined : eq(news.type, input.type),
      input.sourceId === undefined
        ? undefined
        : input.sourceId === null
          ? isNull(news.sourceId)
          : eq(news.sourceId, input.sourceId),
    ),
  );
}
export function listComments(input: z.output<typeof commentListInput>) {
  return sqlPage(
    comments,
    input,
    [comments.content, comments.authorName],
    { createdAt: comments.createdAt, authorName: comments.authorName },
    and(
      input.contentType === undefined ? undefined : eq(comments.contentType, input.contentType),
      input.contentId === undefined ? undefined : eq(comments.contentId, input.contentId),
      input.createdAfter === undefined
        ? undefined
        : gte(comments.createdAt, new Date(input.createdAfter)),
      input.createdBefore === undefined
        ? undefined
        : lte(comments.createdAt, new Date(input.createdBefore)),
    ),
  );
}
export function listBlocks(input: ListInput & { source?: string }) {
  const rows = sqlPage(
    importBlocklist,
    input,
    [importBlocklist.externalId, importBlocklist.name, importBlocklist.reason],
    {
      blockedAt: importBlocklist.blockedAt,
      name: importBlocklist.name,
      key: importBlocklist.externalId,
    },
    input.source === undefined ? undefined : eq(importBlocklist.source, input.source),
  );
  return {
    ...rows,
    items: rows.items.map(({ externalId, ...row }) => ({ ...row, key: externalId })),
  };
}
