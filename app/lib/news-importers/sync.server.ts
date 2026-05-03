/**
 * News Import Sync Logic
 * Handles the sync algorithm for importing news from external sources
 */

import { db } from "~/db";
import { newsImportSources, news } from "~/db/schema";
import { eq, desc, count } from "drizzle-orm";
import type { NewsSyncResult, NewsImportSourceConfig, NewsSourceType, FetchedNewsItem } from "./types";
import { getNewsImporter } from "./index";
import { generateNewsSlug } from "~/lib/news.server";

// ---- Source CRUD ----

export async function getAllNewsImportSources() {
  return db.select().from(newsImportSources).orderBy(desc(newsImportSources.createdAt));
}

export async function getNewsSourceById(sourceId: number) {
  const [source] = await db
    .select()
    .from(newsImportSources)
    .where(eq(newsImportSources.id, sourceId))
    .limit(1);
  return source || null;
}

export async function createNewsImportSource(data: {
  name: string;
  sourceType: NewsSourceType;
  sourceUrl: string;
  sourceIdentifier?: string | null;
  keywords?: string | null;
  enabled?: boolean;
}) {
  const now = new Date();
  const [source] = await db
    .insert(newsImportSources)
    .values({
      ...data,
      enabled: data.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return source;
}

export async function updateNewsImportSource(
  sourceId: number,
  data: Partial<{
    name: string;
    sourceType: NewsSourceType;
    sourceUrl: string;
    sourceIdentifier: string | null;
    keywords: string | null;
    enabled: boolean;
  }>,
) {
  await db
    .update(newsImportSources)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(newsImportSources.id, sourceId));
}

export async function deleteNewsImportSource(sourceId: number) {
  await db.delete(newsImportSources).where(eq(newsImportSources.id, sourceId));
}

// ---- Keyword filtering ----

/**
 * Check if a news item matches any of the configured keywords.
 * Checks title and excerpt (case-insensitive substring match).
 */
function matchesKeywords(item: FetchedNewsItem, keywords: string): boolean {
  const keywordList = keywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (keywordList.length === 0) return true;

  const searchText = `${item.title} ${item.excerpt || ""}`.toLowerCase();
  return keywordList.some((keyword) => searchText.includes(keyword));
}

// ---- Sync ----

async function getNewsBySourceId(sourceId: number) {
  return db.select().from(news).where(eq(news.sourceId, sourceId));
}

async function updateSourceMeta(
  sourceId: number,
  data: {
    lastSyncAt?: Date;
    lastSyncStatus?: string;
    lastSyncError?: string | null;
  },
) {
  await db
    .update(newsImportSources)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(newsImportSources.id, sourceId));
}

/**
 * Sync news from an import source.
 */
export async function syncNewsSource(sourceId: number): Promise<NewsSyncResult> {
  const source = await getNewsSourceById(sourceId);
  if (!source) {
    return { success: false, error: "Source not found", added: 0, updated: 0, filtered: 0, totalPublished: 0 };
  }

  await updateSourceMeta(sourceId, { lastSyncStatus: "pending", lastSyncError: null });

  try {
    const importer = getNewsImporter(source.sourceType as NewsSourceType);

    const config: NewsImportSourceConfig = {
      id: source.id,
      name: source.name,
      sourceType: source.sourceType as NewsSourceType,
      sourceUrl: source.sourceUrl,
      sourceIdentifier: source.sourceIdentifier,
      keywords: source.keywords,
    };

    const fetchedItems = await importer.fetchItems(config);

    // Apply keyword filtering
    let filtered = 0;
    let itemsToProcess: FetchedNewsItem[];
    if (source.keywords) {
      itemsToProcess = fetchedItems.filter((item) => {
        if (matchesKeywords(item, source.keywords!)) return true;
        filtered++;
        return false;
      });
    } else {
      itemsToProcess = fetchedItems;
    }

    // Get existing items for this source
    const existingItems = await getNewsBySourceId(source.id);
    const existingByItemId = new Map(
      existingItems.filter((n) => n.sourceItemId).map((n) => [n.sourceItemId!, n]),
    );

    const now = new Date();
    let added = 0;
    let updated = 0;

    for (const item of itemsToProcess) {
      const existing = existingByItemId.get(item.sourceItemId);

      if (!existing) {
        // New item
        const slug = await generateNewsSlug(item.title);
        await db.insert(news).values({
          slug,
          type: "link",
          title: item.title,
          externalUrl: item.url,
          sourceName: source.name,
          content: item.excerpt || "",
          excerpt: item.excerpt || null,
          publishedAt: item.publishedAt || now,
          status: "pending_review",
          sourceId: source.id,
          sourceItemId: item.sourceItemId,
          createdAt: now,
          updatedAt: now,
        });
        added++;
      } else {
        // Existing -- update title/excerpt if changed
        const changes: Record<string, unknown> = {};
        if (existing.title !== item.title) changes.title = item.title;
        if (item.excerpt && existing.excerpt !== item.excerpt) {
          changes.excerpt = item.excerpt;
          if (!existing.content || existing.content === existing.excerpt) {
            changes.content = item.excerpt;
          }
        }
        if (Object.keys(changes).length > 0) {
          await db
            .update(news)
            .set({ ...changes, updatedAt: now })
            .where(eq(news.id, existing.id));
          updated++;
        }
      }
    }

    await updateSourceMeta(sourceId, {
      lastSyncAt: now,
      lastSyncStatus: "success",
      lastSyncError: null,
    });

    // Count total published
    const [{ total }] = await db
      .select({ total: count() })
      .from(news)
      .where(eq(news.status, "published"));

    return { success: true, added, updated, filtered, totalPublished: total };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await updateSourceMeta(sourceId, {
      lastSyncAt: new Date(),
      lastSyncStatus: "error",
      lastSyncError: error,
    });
    return { success: false, error, added: 0, updated: 0, filtered: 0, totalPublished: 0 };
  }
}

/**
 * Sync all enabled news import sources.
 */
export async function syncAllNewsSources(): Promise<{
  sourcesTotal: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  added: number;
  updated: number;
  filtered: number;
  errors: string[];
}> {
  const sources = await db
    .select()
    .from(newsImportSources)
    .where(eq(newsImportSources.enabled, true));

  const totals = {
    sourcesTotal: sources.length,
    sourcesSucceeded: 0,
    sourcesFailed: 0,
    added: 0,
    updated: 0,
    filtered: 0,
    errors: [] as string[],
  };

  for (const source of sources) {
    const result = await syncNewsSource(source.id);
    if (result.success) {
      totals.sourcesSucceeded++;
      totals.added += result.added;
      totals.updated += result.updated;
      totals.filtered += result.filtered;
    } else {
      totals.sourcesFailed++;
      totals.errors.push(`${source.name}: ${result.error}`);
    }
  }

  return totals;
}

// ---- Triage functions ----

/**
 * Get all pending_review news items with source info.
 */
export async function getAllPendingNews() {
  return db
    .select({
      id: news.id,
      title: news.title,
      externalUrl: news.externalUrl,
      sourceName: news.sourceName,
      excerpt: news.excerpt,
      publishedAt: news.publishedAt,
      sourceType: newsImportSources.sourceType,
    })
    .from(news)
    .leftJoin(newsImportSources, eq(news.sourceId, newsImportSources.id))
    .where(eq(news.status, "pending_review"))
    .orderBy(desc(news.createdAt));
}

/**
 * Approve a pending_review news item (moves to published).
 */
export async function approveNewsItem(newsId: number) {
  await db
    .update(news)
    .set({ status: "published", updatedAt: new Date() })
    .where(eq(news.id, newsId));
}

/**
 * Hide a news item.
 */
export async function hideNewsItem(newsId: number) {
  await db
    .update(news)
    .set({ status: "hidden", updatedAt: new Date() })
    .where(eq(news.id, newsId));
}

/**
 * Hide all remaining pending_review news items.
 */
export async function hideAllPendingNews(): Promise<number> {
  const result = await db
    .update(news)
    .set({ status: "hidden", updatedAt: new Date() })
    .where(eq(news.status, "pending_review"));
  return result.changes;
}
