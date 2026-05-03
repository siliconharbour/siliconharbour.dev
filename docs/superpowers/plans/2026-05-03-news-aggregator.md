# News Aggregator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty news CMS with a news aggregator that auto-imports link posts from RSS feeds (with optional keyword filtering) and custom scrapers, while preserving the ability to publish original articles.

**Architecture:** Unified `news` table with `type` column (`link` | `article`), backed by a `newsImportSources` table mirroring the job import pattern. RSS importer as the primary source type, custom scraper registry for sites without feeds. Pending review triage UI on the manage import page, same pattern as jobs.

**Tech Stack:** Drizzle ORM / SQLite, React Router framework mode, RSS XML parsing, MCP bridge functions with Zod validation.

---

## File Structure

### New files to create

| File | Responsibility |
|------|---------------|
| `drizzle/0047_news_aggregator.sql` | Migration: drop old news, create new news + newsImportSources tables, rebuild news_fts |
| `app/lib/news-importers/types.ts` | `FetchedNewsItem`, `NewsSourceType`, `NewsSyncResult`, `NewsImporter` types |
| `app/lib/news-importers/index.ts` | Importer registry (rss, custom) |
| `app/lib/news-importers/rss.server.ts` | Generic RSS/Atom feed parser |
| `app/lib/news-importers/custom.server.ts` | Custom scraper registry (empty initially, pattern ready) |
| `app/lib/news-importers/sync.server.ts` | Sync algorithm, source CRUD, triage functions, keyword filtering |
| `app/routes/news/links.tsx` | "Links" filter tab |
| `app/routes/news/articles.tsx` | "Articles" filter tab |
| `app/routes/manage/import/news.tsx` | Import source management + pending review triage UI |
| `app/routes/manage/import/news.new.tsx` | Add news source form |

### Existing files to modify

| File | Changes |
|------|---------|
| `app/db/schema.ts` | Replace `newsTypes` enum, redefine `news` table, add `newsImportSources` table, add `newsSourceTypes` enum, update type exports |
| `drizzle/meta/_journal.json` | Add migration entry idx 47 |
| `app/routes.ts` | Update news layout tabs, add import/news routes, remove old type tabs |
| `app/lib/news.server.ts` | Rewrite for new schema (status field, type field, externalUrl, sourceName) |
| `app/lib/news-listing.server.ts` | Update type filter from old types to `link` | `article` |
| `app/components/news/NewsListing.tsx` | Dual display: link posts (external link + source badge) vs articles (internal link), new filter tabs |
| `app/routes/news/layout.tsx` | Update tabs from old types to All / Links / Articles |
| `app/routes/news/all.tsx` | Update meta, pass `showTypeBadge` |
| `app/routes/news/detail.tsx` | Dual rendering: article (full content) vs link post (excerpt + "Read on" button) |
| `app/routes/news/index.md.tsx` | Add `type`, `externalUrl`, `sourceName` to markdown output |
| `app/routes/news/detail.md.tsx` | Same field additions |
| `app/routes/news-rss.tsx` | Use `externalUrl` for link post items |
| `app/routes/news-og.tsx` | Update type labels |
| `app/routes/api/news.tsx` | Add new fields to JSON output |
| `app/routes/api/news.$slug.tsx` | Same field additions |
| `app/lib/markdown.server.ts` | Update `newsToMarkdown()` for new fields |
| `app/lib/og-image.server.ts` | Update `prepareNewsOGData()` type labels |
| `app/routes/manage/news/index.tsx` | Add type/status badges, "Submit URL" action |
| `app/routes/manage/news/new.tsx` | Support link post creation (URL submission with metadata extraction) |
| `app/routes/manage/news/edit.tsx` | Handle new schema fields |
| `app/mcp/bridge.ts` | Add `submitNewsLink`, `createNewsArticle`, `pendingNews`, `approveNews`, `hideNews` |
| `app/mcp/server.ts` | Register news MCP tools |

### Files to delete

| File | Reason |
|------|--------|
| `app/routes/news/announcements.tsx` | Old type tab, replaced by Links/Articles |
| `app/routes/news/general.tsx` | Old type tab |
| `app/routes/news/editorial.tsx` | Old type tab |
| `app/routes/news/updates.tsx` | Old type tab |

---

## Task 1: Database Schema & Migration

**Files:**
- Modify: `app/db/schema.ts:267-286` (news table + types)
- Create: `drizzle/0047_news_aggregator.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Update schema.ts — replace newsTypes and news table**

Use `sed` to replace the news section in schema.ts (lines 267-286). The new schema:

```typescript
// News - link posts and original articles
export const newsTypes = ["link", "article"] as const;
export type NewsType = (typeof newsTypes)[number];

export const newsStatuses = ["draft", "pending_review", "published", "hidden"] as const;
export type NewsStatus = (typeof newsStatuses)[number];

export const newsSourceTypes = ["rss", "custom"] as const;
export type NewsSourceType = (typeof newsSourceTypes)[number];

export const newsImportSources = sqliteTable("news_import_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sourceType: text("source_type", { enum: newsSourceTypes }).notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceIdentifier: text("source_identifier"),
  keywords: text("keywords"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
  lastSyncStatus: text("last_sync_status"),
  lastSyncError: text("last_sync_error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const news = sqliteTable("news", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  type: text("type", { enum: newsTypes }).notNull().default("link"),
  title: text("title").notNull(),
  externalUrl: text("external_url"),
  sourceName: text("source_name"),
  content: text("content").notNull().default(""),
  excerpt: text("excerpt"),
  coverImage: text("cover_image"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  status: text("status", { enum: newsStatuses }).notNull().default("draft"),
  sourceId: integer("source_id").references(() => newsImportSources.id, { onDelete: "set null" }),
  sourceItemId: text("source_item_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

Use `sed` to make this replacement. The `newsImportSources` table must come before the `news` table since `news.sourceId` references it.

Also update the type exports near the end of schema.ts. Find the line with `export type News =` and `export type NewNews =` and add the new types:

```typescript
export type News = typeof news.$inferSelect;
export type NewNews = typeof news.$inferInsert;
export type NewsImportSource = typeof newsImportSources.$inferSelect;
export type NewNewsImportSource = typeof newsImportSources.$inferInsert;
```

- [ ] **Step 2: Create migration SQL**

Create `drizzle/0047_news_aggregator.sql`:

```sql
-- Drop old news table (empty in production)
DROP TABLE IF EXISTS `news`;

-- Drop old FTS table
DROP TABLE IF EXISTS `news_fts`;

-- Create news import sources table
CREATE TABLE `news_import_sources` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `source_type` text NOT NULL DEFAULT 'rss',
  `source_url` text NOT NULL,
  `source_identifier` text,
  `keywords` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `last_sync_at` integer,
  `last_sync_status` text,
  `last_sync_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

-- Create new news table
CREATE TABLE `news` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `slug` text NOT NULL,
  `type` text NOT NULL DEFAULT 'link',
  `title` text NOT NULL,
  `external_url` text,
  `source_name` text,
  `content` text NOT NULL DEFAULT '',
  `excerpt` text,
  `cover_image` text,
  `published_at` integer,
  `status` text NOT NULL DEFAULT 'draft',
  `source_id` integer REFERENCES `news_import_sources`(`id`) ON DELETE SET NULL,
  `source_item_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

-- Unique constraint on slug
CREATE UNIQUE INDEX `news_slug_unique` ON `news`(`slug`);

-- Index for deduplication
CREATE INDEX `news_source_dedup` ON `news`(`source_id`, `source_item_id`);

-- Index for listing queries
CREATE INDEX `news_status_published` ON `news`(`status`, `published_at`);

-- Rebuild FTS
CREATE VIRTUAL TABLE IF NOT EXISTS `news_fts` USING fts5(title, content='news', content_rowid='id', tokenize='trigram');

CREATE TRIGGER IF NOT EXISTS news_ai AFTER INSERT ON `news` BEGIN
  INSERT INTO news_fts(rowid, title) VALUES (new.id, new.title);
END;
CREATE TRIGGER IF NOT EXISTS news_ad AFTER DELETE ON `news` BEGIN
  INSERT INTO news_fts(news_fts, rowid, title) VALUES('delete', old.id, old.title);
END;
CREATE TRIGGER IF NOT EXISTS news_au AFTER UPDATE ON `news` BEGIN
  INSERT INTO news_fts(news_fts, rowid, title) VALUES('delete', old.id, old.title);
  INSERT INTO news_fts(rowid, title) VALUES (new.id, new.title);
END;
```

- [ ] **Step 3: Update migration journal**

Add to `drizzle/meta/_journal.json` entries array:

```json
{
  "idx": 47,
  "version": "6",
  "when": 1768732000000,
  "tag": "0047_news_aggregator",
  "breakpoints": true
}
```

- [ ] **Step 4: Run migration**

```bash
pnpm run db:migrate
```

Expected: Migration applies successfully. Old news table dropped, new tables created.

- [ ] **Step 5: Verify schema**

```bash
sqlite3 ./data/siliconharbour.db ".schema news"
sqlite3 ./data/siliconharbour.db ".schema news_import_sources"
sqlite3 ./data/siliconharbour.db ".schema news_fts"
```

Expected: All three tables exist with correct columns.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: news aggregator schema migration

Drop old empty news table, create new news table with link/article types,
status workflow, external URL support, and import source tracking.
Add newsImportSources table mirroring job import pattern.
Rebuild news_fts with trigram tokenizer."
```

---

## Task 2: News Importer Types & Registry

**Files:**
- Create: `app/lib/news-importers/types.ts`
- Create: `app/lib/news-importers/index.ts`

- [ ] **Step 1: Create types.ts**

Create `app/lib/news-importers/types.ts`:

```typescript
// =============================================================================
// News Importer Types - Shared types for news import modules
// This file is client-safe (no server imports)
// =============================================================================

/**
 * Supported news source types
 */
export const newsSourceTypes = ["rss", "custom"] as const;
export type NewsSourceType = (typeof newsSourceTypes)[number];

/**
 * Display labels for source types
 */
export const sourceTypeLabels: Record<NewsSourceType, string> = {
  rss: "RSS",
  custom: "Custom",
};

/**
 * A news item fetched from an external source
 */
export interface FetchedNewsItem {
  /** Unique identifier from the source (RSS guid or URL) */
  sourceItemId: string;
  /** Article title */
  title: string;
  /** External URL to the full article */
  url: string;
  /** Short summary or description */
  excerpt?: string;
  /** When the article was published */
  publishedAt?: Date;
}

/**
 * Result of a news sync operation
 */
export interface NewsSyncResult {
  success: boolean;
  error?: string;
  added: number;
  updated: number;
  filtered: number;
  totalPublished: number;
}

/**
 * Configuration for a news import source
 */
export interface NewsImportSourceConfig {
  id: number;
  name: string;
  sourceType: NewsSourceType;
  sourceUrl: string;
  sourceIdentifier?: string | null;
  keywords?: string | null;
}

/**
 * Interface that all news importers must implement
 */
export interface NewsImporter {
  sourceType: NewsSourceType;
  meta: {
    name: string;
    description: string;
  };
  /** Fetch news items from the source */
  fetchItems(config: NewsImportSourceConfig): Promise<FetchedNewsItem[]>;
}
```

- [ ] **Step 2: Create index.ts**

Create `app/lib/news-importers/index.ts`:

```typescript
/**
 * News Importer Registry
 * Factory for getting the correct importer based on source type
 */

import type { NewsImporter, NewsSourceType } from "./types";
import { rssImporter } from "./rss.server";
import { customNewsImporter } from "./custom.server";

const importers: Record<string, NewsImporter> = {
  rss: rssImporter,
  custom: customNewsImporter,
};

/**
 * Get an importer for the given source type
 */
export function getNewsImporter(sourceType: NewsSourceType): NewsImporter {
  const importer = importers[sourceType];
  if (!importer) {
    throw new Error(
      `Unsupported news source type: ${sourceType}. Supported types: ${Object.keys(importers).join(", ")}`,
    );
  }
  return importer;
}

/**
 * Check if a source type has an importer available
 */
export function hasNewsImporter(sourceType: string): boolean {
  return sourceType in importers;
}

// Re-export types for convenience
export * from "./types";
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: news importer types and registry

FetchedNewsItem, NewsSyncResult, NewsImporter interfaces.
Registry pattern mirroring job importers with rss + custom source types."
```

---

## Task 3: RSS Importer

**Files:**
- Create: `app/lib/news-importers/rss.server.ts`

- [ ] **Step 1: Create RSS importer**

Create `app/lib/news-importers/rss.server.ts`:

```typescript
/**
 * RSS/Atom Feed Importer
 * Fetches and parses RSS/Atom feeds to extract news items
 */

import type { NewsImporter, FetchedNewsItem, NewsImportSourceConfig } from "./types";

/**
 * Parse RSS/Atom XML into news items.
 * Handles both RSS 2.0 (<item>) and Atom (<entry>) feeds.
 * Uses regex-based parsing to avoid XML parser dependencies.
 */
function parseRssItems(xml: string): FetchedNewsItem[] {
  const items: FetchedNewsItem[] = [];

  // Try RSS 2.0 format first (<item> elements)
  const rssItemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = rssItemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const guid = extractTag(block, "guid");
    const description = extractTag(block, "description");
    const pubDate = extractTag(block, "pubDate");

    if (!title || !link) continue;

    items.push({
      sourceItemId: guid || link,
      title: decodeHtmlEntities(title),
      url: link,
      excerpt: description ? decodeHtmlEntities(stripHtml(description)).slice(0, 500) : undefined,
      publishedAt: pubDate ? new Date(pubDate) : undefined,
    });
  }

  // If no RSS items found, try Atom format (<entry> elements)
  if (items.length === 0) {
    const atomEntryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    while ((match = atomEntryRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = extractTag(block, "title");
      // Atom uses <link href="..."/> (self-closing) or <link href="...">
      const link = extractAtomLink(block);
      const id = extractTag(block, "id");
      const summary = extractTag(block, "summary") || extractTag(block, "content");
      const published = extractTag(block, "published") || extractTag(block, "updated");

      if (!title || !link) continue;

      items.push({
        sourceItemId: id || link,
        title: decodeHtmlEntities(title),
        url: link,
        excerpt: summary ? decodeHtmlEntities(stripHtml(summary)).slice(0, 500) : undefined,
        publishedAt: published ? new Date(published) : undefined,
      });
    }
  }

  return items;
}

/** Extract text content from an XML tag */
function extractTag(xml: string, tag: string): string | null {
  // Handle CDATA sections
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle regular text content
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}

/** Extract href from Atom <link> element */
function extractAtomLink(xml: string): string | null {
  // Match <link rel="alternate" href="..."/> or <link href="..."/>
  const altMatch = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(xml);
  if (altMatch) return altMatch[1];
  const hrefMatch = /<link[^>]*href=["']([^"']+)["']/i.exec(xml);
  return hrefMatch ? hrefMatch[1] : null;
}

/** Strip HTML tags from text */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Decode common HTML entities */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export const rssImporter: NewsImporter = {
  sourceType: "rss",
  meta: {
    name: "RSS/Atom Feed",
    description: "Import news from RSS or Atom feeds",
  },
  async fetchItems(config: NewsImportSourceConfig): Promise<FetchedNewsItem[]> {
    const response = await fetch(config.sourceUrl, {
      headers: {
        "User-Agent": "siliconharbour.dev news aggregator",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    return parseRssItems(xml);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: RSS/Atom feed importer for news

Regex-based XML parser handles both RSS 2.0 and Atom feeds.
Extracts title, link, guid, description, pubDate.
Handles CDATA sections and HTML entity decoding."
```

---

## Task 4: Custom Scraper Registry

**Files:**
- Create: `app/lib/news-importers/custom.server.ts`

- [ ] **Step 1: Create custom scraper registry**

Create `app/lib/news-importers/custom.server.ts`:

```typescript
/**
 * Custom News Scraper Registry
 * For sites without RSS feeds (e.g. VOCM)
 * Pattern mirrors app/lib/job-importers/custom.server.ts
 */

import type { NewsImporter, FetchedNewsItem, NewsImportSourceConfig } from "./types";

/**
 * Scraper function signature.
 * sourceIdentifier format: "scraperName" or "scraperName:config"
 */
type NewsScraper = (config: NewsImportSourceConfig) => Promise<FetchedNewsItem[]>;

/**
 * Registry of custom news scrapers.
 * Add new scrapers here as needed.
 */
const scrapers: Record<string, NewsScraper> = {
  // Add scrapers as needed, e.g.:
  // vocm: vocmScraper,
};

function parseScraperName(sourceIdentifier: string): string {
  // sourceIdentifier is "scraperName" or "scraperName:extraConfig"
  return sourceIdentifier.split(":")[0];
}

export const customNewsImporter: NewsImporter = {
  sourceType: "custom",
  meta: {
    name: "Custom Scraper",
    description: "Custom scrapers for sites without RSS feeds",
  },
  async fetchItems(config: NewsImportSourceConfig): Promise<FetchedNewsItem[]> {
    const identifier = config.sourceIdentifier;
    if (!identifier) {
      throw new Error("Custom news sources require a sourceIdentifier");
    }

    const scraperName = parseScraperName(identifier);
    const scraper = scrapers[scraperName];
    if (!scraper) {
      throw new Error(
        `Unknown news scraper: ${scraperName}. Available: ${Object.keys(scrapers).join(", ") || "(none)"}`,
      );
    }

    return scraper(config);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: custom news scraper registry

Empty registry ready for VOCM and other scrapers.
Same pattern as job custom importers."
```

---

## Task 5: News Sync Algorithm

**Files:**
- Create: `app/lib/news-importers/sync.server.ts`

- [ ] **Step 1: Create sync.server.ts**

Create `app/lib/news-importers/sync.server.ts`. This is the largest new file -- handles sync logic, source CRUD, keyword filtering, and triage functions:

```typescript
/**
 * News Import Sync Logic
 * Handles the sync algorithm for importing news from external sources
 */

import { db } from "~/db";
import { newsImportSources, news } from "~/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
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
 *
 * Algorithm:
 * 1. Fetch items from source (RSS or custom scraper)
 * 2. Apply keyword filtering if configured
 * 3. Deduplicate against existing items by sourceId + sourceItemId
 * 4. New items: insert as pending_review link posts
 * 5. Existing items: update title/excerpt if changed
 * 6. Items that disappear from feed: leave alone (news doesn't expire)
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

  const totals = { sourcesTotal: sources.length, sourcesSucceeded: 0, sourcesFailed: 0, added: 0, updated: 0, filtered: 0, errors: [] as string[] };

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
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: news sync algorithm with keyword filtering

Source CRUD, sync with dedup by sourceId+sourceItemId, keyword filtering
for noisy sources, triage functions (approve/hide/hide-all).
Mirrors job import sync pattern."
```

---

## Task 6: Rewrite news.server.ts

**Files:**
- Modify: `app/lib/news.server.ts`
- Modify: `app/lib/news-listing.server.ts`

- [ ] **Step 1: Rewrite news.server.ts for new schema**

The existing file needs updating for the new schema. Key changes:
- `createNews` now accepts `type`, `externalUrl`, `sourceName`, `status`
- `updateNews` handles the new fields
- `getPublishedNews` filters by `status = "published"` instead of just `publishedAt`
- `getPaginatedNews` accepts `typeFilter` as `"link" | "article"` instead of the old types
- `getAllNews` includes status for the manage listing

Rewrite `app/lib/news.server.ts`:

```typescript
import { db } from "~/db";
import { news, type News, type NewNews, type NewsType, newsTypes } from "~/db/schema";
import { eq, desc, and, count, inArray } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";

export { newsTypes, type NewsType };

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: news.slug }).from(news);
  return rows.map((r) => r.slug);
}

export async function generateNewsSlug(title: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(title);
  let existingSlugs = await getExistingSlugs();
  if (excludeId) {
    const current = await db
      .select({ slug: news.slug })
      .from(news)
      .where(eq(news.id, excludeId))
      .get();
    if (current) {
      existingSlugs = existingSlugs.filter((s) => s !== current.slug);
    }
  }
  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createNews(
  item: Omit<NewNews, "slug"> & { type?: NewsType; status?: string },
): Promise<News> {
  const slug = await generateNewsSlug(item.title);
  const [newItem] = await db
    .insert(news)
    .values({ ...item, slug })
    .returning();
  if (newItem.content) {
    await syncReferences("news", newItem.id, newItem.content);
  }
  return newItem;
}

export async function updateNews(
  id: number,
  item: Partial<Omit<NewNews, "slug">>,
): Promise<News | null> {
  let updateData: Partial<NewNews> = { ...item, updatedAt: new Date() };
  if (item.title) {
    updateData.slug = await generateNewsSlug(item.title, id);
  }
  const [updated] = await db.update(news).set(updateData).where(eq(news.id, id)).returning();
  if (!updated) return null;
  if (item.content) {
    await syncReferences("news", id, item.content);
  }
  return updated;
}

export async function deleteNews(id: number): Promise<boolean> {
  await db.delete(news).where(eq(news.id, id));
  return true;
}

export async function getNewsById(id: number): Promise<News | null> {
  return db.select().from(news).where(eq(news.id, id)).get() ?? null;
}

export async function getNewsBySlug(slug: string): Promise<News | null> {
  return db.select().from(news).where(eq(news.slug, slug)).get() ?? null;
}

export async function getAllNews(): Promise<News[]> {
  return db.select().from(news).orderBy(desc(news.createdAt));
}

export async function getPublishedNews(): Promise<News[]> {
  return db
    .select()
    .from(news)
    .where(eq(news.status, "published"))
    .orderBy(desc(news.publishedAt));
}

// Paginated queries with search
export interface PaginatedNews {
  items: News[];
  total: number;
}

export async function getPaginatedNews(
  limit: number,
  offset: number,
  searchQuery?: string,
  typeFilter?: NewsType,
): Promise<PaginatedNews> {
  const conditions = [eq(news.status, "published")];

  if (typeFilter) {
    conditions.push(eq(news.type, typeFilter));
  }

  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("news", searchQuery);
    if (matchingIds.length === 0) {
      return { items: [], total: 0 };
    }
    conditions.push(inArray(news.id, matchingIds));
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(news)
    .where(and(...conditions));

  const items = await db
    .select()
    .from(news)
    .where(and(...conditions))
    .orderBy(desc(news.publishedAt))
    .limit(limit)
    .offset(offset);

  return { items, total };
}
```

- [ ] **Step 2: Update news-listing.server.ts**

Update `app/lib/news-listing.server.ts` -- the `type` parameter is now `"link" | "article"` instead of the old types:

```typescript
import { isAfter, subDays } from "date-fns";
import type { NewsType } from "~/db/schema";
import { getPaginatedNews } from "./news.server";
import { parsePublicListParams } from "./public-query.server";

export async function loadNewsListingData(request: Request, type?: NewsType) {
  const url = new URL(request.url);
  const { limit, offset, searchQuery } = parsePublicListParams(url);
  const { items: articles, total } = await getPaginatedNews(limit, offset, searchQuery, type);
  const oneWeekAgo = subDays(new Date(), 7);
  const hasRecentHeadline =
    articles.length > 0 && articles[0].publishedAt && isAfter(articles[0].publishedAt, oneWeekAgo);

  return { articles, total, limit, offset, searchQuery, hasRecentHeadline };
}
```

This file doesn't actually change in content -- the types just updated upstream. Keep as-is.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: rewrite news.server.ts for new schema

Status-based filtering (published instead of publishedAt <= now),
type filter supports link/article, createNews accepts new fields."
```

---

## Task 7: Update Public News Routes

**Files:**
- Modify: `app/routes/news/layout.tsx`
- Create: `app/routes/news/links.tsx`
- Create: `app/routes/news/articles.tsx`
- Modify: `app/routes/news/all.tsx`
- Delete: `app/routes/news/announcements.tsx`, `general.tsx`, `editorial.tsx`, `updates.tsx`
- Modify: `app/routes.ts` (news tab routes)

- [ ] **Step 1: Update layout.tsx with new tabs**

Replace the filters array in `app/routes/news/layout.tsx`:

```typescript
const filters = [
  { path: "/news", label: "All", exact: true },
  { path: "/news/links", label: "Links" },
  { path: "/news/articles", label: "Articles" },
];
```

Remove the "+ New Article" button from the layout (it's admin-only and will live in `/manage/news`). Remove the `loader` and `useLoaderData` since `isAdmin` is no longer needed here. Simplify to:

```typescript
import type { Route } from "./+types/layout";
import { Link, Outlet, useLocation } from "react-router";

const filters = [
  { path: "/news", label: "All", exact: true },
  { path: "/news/links", label: "Links" },
  { path: "/news/articles", label: "Articles" },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "News - siliconharbour.dev" },
    { name: "description", content: "News and announcements from the St. John's tech community" },
  ];
}

export default function NewsLayout() {
  const location = useLocation();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-4">
          {filters.map((filter) => {
            const isActive = filter.exact
              ? location.pathname === filter.path
              : location.pathname.startsWith(filter.path);
            return (
              <Link
                key={filter.path}
                to={filter.path}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-harbour-600 text-white" : "text-harbour-600 hover:bg-harbour-50"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}
        </div>
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create links.tsx**

Create `app/routes/news/links.tsx`:

```typescript
import type { Route } from "./+types/links";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Links - News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadNewsListingData(request, "link");
}

export default function NewsLinks() {
  const data = useLoaderData<typeof loader>();

  return (
    <NewsListing
      data={data}
      searchPlaceholder="Search links..."
      emptyNoSearch="No link posts yet."
      emptyWithSearch="No links match your search."
      headlineMode={false}
      showTypeBadge={false}
    />
  );
}
```

- [ ] **Step 3: Create articles.tsx**

Create `app/routes/news/articles.tsx`:

```typescript
import type { Route } from "./+types/articles";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Articles - News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadNewsListingData(request, "article");
}

export default function NewsArticles() {
  const data = useLoaderData<typeof loader>();

  return (
    <NewsListing
      data={data}
      searchPlaceholder="Search articles..."
      emptyNoSearch="No articles yet."
      emptyWithSearch="No articles match your search."
      headlineMode
      showTypeBadge={false}
    />
  );
}
```

- [ ] **Step 4: Update all.tsx**

Update `app/routes/news/all.tsx` -- `showTypeBadge` should show "Link" / "Article" badges:

```typescript
import type { Route } from "./+types/all";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";
import { buildSeoMeta } from "~/lib/seo";

export function meta({}: Route.MetaArgs) {
  return buildSeoMeta({
    title: "NL Tech News & Updates",
    description: "News, announcements, and updates from the tech scene in Newfoundland & Labrador.",
    url: "/news",
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadNewsListingData(request);
}

export default function NewsAll() {
  const data = useLoaderData<typeof loader>();

  return (
    <NewsListing
      data={data}
      searchPlaceholder="Search news..."
      emptyNoSearch="No news yet."
      emptyWithSearch="No news matches your search."
      headlineMode
      showTypeBadge
    />
  );
}
```

- [ ] **Step 5: Delete old type tabs**

```bash
rm app/routes/news/announcements.tsx
rm app/routes/news/general.tsx
rm app/routes/news/editorial.tsx
rm app/routes/news/updates.tsx
```

- [ ] **Step 6: Update routes.ts**

In `app/routes.ts`, replace the news layout section (lines ~128-135):

```typescript
    // News (realtime content, separate from directory)
    layout("routes/news/layout.tsx", [
      route("news", "routes/news/all.tsx", { id: "news-index" }),
      route("news/links", "routes/news/links.tsx"),
      route("news/articles", "routes/news/articles.tsx"),
    ]),
```

Also add the import/news routes in the import prefix section (after the events routes, around line 227):

```typescript
      route("news", "routes/manage/import/news.tsx"),
      route("news/new", "routes/manage/import/news.new.tsx"),
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: update public news routes for link/article types

Replace announcement/general/editorial/updates tabs with All/Links/Articles.
Remove admin button from public layout. Add import/news route registration."
```

---

## Task 8: Update NewsListing Component

**Files:**
- Modify: `app/components/news/NewsListing.tsx`

- [ ] **Step 1: Rewrite NewsListing for dual display**

The component needs to handle link posts (external link + source badge) and articles (internal link + cover image) differently. Update `app/components/news/NewsListing.tsx`:

Key changes:
- `TypeBadge` now shows "Link" or "Article" instead of old types
- Link posts render with: title linking to `externalUrl`, source name badge, permalink icon to `/news/:slug`
- Articles render with: title linking to `/news/:slug`, cover image, excerpt
- The `HeadlineArticle`, `SecondaryArticle`, and `ArticleCard` components all need to check `article.type` and `article.externalUrl` to decide link target

Replace `TypeBadge`:
```typescript
function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    link: "Link",
    article: "Article",
  };
  return (
    <span className="text-xs uppercase tracking-wide text-harbour-500 font-medium">
      {labels[type] || type}
    </span>
  );
}
```

Add a `SourceBadge` component:
```typescript
function SourceBadge({ sourceName }: { sourceName: string | null }) {
  if (!sourceName) return null;
  return (
    <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-500">
      {sourceName}
    </span>
  );
}
```

For each article card variant, update the link behavior:
- If `article.externalUrl` exists (link post): primary title links to `article.externalUrl` with `target="_blank" rel="noopener noreferrer"`, add a small permalink icon linking to `/news/${article.slug}`
- If no `externalUrl` (article): title links to `/news/${article.slug}` as before
- Show `SourceBadge` for link posts

The full component is large -- rewrite it in place preserving the same `HeadlineArticle` / `SecondaryArticle` / `ArticleCard` structure but updating each to handle the dual behavior. Add the `externalUrl` and `sourceName` fields from the `News` type which are now available.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: update NewsListing for link posts vs articles

Link posts show external URL, source badge, and permalink icon.
Articles show internal link and cover image as before.
TypeBadge shows Link/Article instead of old types."
```

---

## Task 9: Update Detail Page

**Files:**
- Modify: `app/routes/news/detail.tsx`

- [ ] **Step 1: Update detail page for dual rendering**

Update `app/routes/news/detail.tsx` to render differently for link posts vs articles.

For link posts (`article.type === "link"`):
- Title
- Source name + published date
- Excerpt
- Prominent "Read on [sourceName]" link/button pointing to `article.externalUrl`
- Comments and backlinks (if enabled)

For articles (`article.type === "article"`):
- Same as current: cover image, title, full markdown content, comments, backlinks

Update the component's JSX to branch on `article.type`:

```tsx
{article.type === "link" ? (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold text-harbour-700">{article.title}</h1>
      <div className="flex items-center gap-2 text-harbour-500">
        {article.sourceName && <span className="font-medium">{article.sourceName}</span>}
        {article.publishedAt && (
          <span>{format(article.publishedAt, "MMMM d, yyyy")}</span>
        )}
      </div>
    </div>
    {article.excerpt && (
      <p className="text-harbour-600 text-lg">{article.excerpt}</p>
    )}
    {article.content && article.content !== article.excerpt && (
      <div className="prose">
        <RichMarkdown content={article.content} resolvedRefs={resolvedRefs} />
      </div>
    )}
    {article.externalUrl && (
      <a
        href={article.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
      >
        Read on {article.sourceName || "source"}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    )}
  </div>
) : (
  /* existing article rendering */
)}
```

Also update the `meta` function to handle both types -- `ogType` should be `"article"` for both, but description could differ.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: dual rendering on news detail page

Link posts show excerpt + prominent 'Read on [source]' button.
Articles show full markdown content as before."
```

---

## Task 10: Update Supporting Endpoints

**Files:**
- Modify: `app/routes/news-rss.tsx`
- Modify: `app/routes/news-og.tsx`
- Modify: `app/routes/api/news.tsx`
- Modify: `app/routes/api/news.$slug.tsx`
- Modify: `app/routes/news/index.md.tsx`
- Modify: `app/routes/news/detail.md.tsx`
- Modify: `app/lib/markdown.server.ts` (newsToMarkdown)
- Modify: `app/lib/og-image.server.ts` (prepareNewsOGData)

- [ ] **Step 1: Update RSS feed**

In `app/routes/news-rss.tsx`, for link posts, use `article.externalUrl` as the `<link>` element instead of the siliconharbour.dev URL:

```typescript
<link>${article.externalUrl || `https://siliconharbour.dev/news/${article.slug}`}</link>
```

- [ ] **Step 2: Update OG image**

In `app/lib/og-image.server.ts` `prepareNewsOGData()`, update the type label logic:

```typescript
const typeLabel = article.type === "link"
  ? article.sourceName || "Link"
  : "Article";
```

- [ ] **Step 3: Update JSON API endpoints**

In both `app/routes/api/news.tsx` and `app/routes/api/news.$slug.tsx`, add `type`, `externalUrl`, `sourceName`, `status` to the `mapArticle` function:

```typescript
const mapArticle = (article: typeof news.$inferSelect) => ({
  id: article.id,
  slug: article.slug,
  type: article.type,
  title: article.title,
  externalUrl: article.externalUrl,
  sourceName: article.sourceName,
  content: article.content,
  excerpt: article.excerpt,
  coverImage: imageUrl(article.coverImage),
  publishedAt: article.publishedAt?.toISOString() || null,
  status: article.status,
  url: contentUrl("news", article.slug),
  createdAt: article.createdAt.toISOString(),
  updatedAt: article.updatedAt.toISOString(),
});
```

Also update the listing query to filter by `eq(news.status, "published")` instead of `isNotNull(news.publishedAt)`.

- [ ] **Step 4: Update markdown endpoints**

In `app/lib/markdown.server.ts` `newsToMarkdown()`, add new frontmatter fields:

```typescript
export function newsToMarkdown(article: News): string {
  const frontmatter = formatFrontmatter({
    type: "news",
    id: article.id,
    slug: article.slug,
    title: article.title,
    url: `${SITE_URL}/news/${article.slug}`,
    api_url: `${SITE_URL}/api/news/${article.slug}`,
    news_type: article.type,
    external_url: article.externalUrl,
    source_name: article.sourceName,
    excerpt: article.excerpt,
    status: article.status,
    published_at: article.publishedAt,
    updated_at: article.updatedAt,
  });
  // rest unchanged
}
```

In `app/routes/news/index.md.tsx`, add `type` and `externalUrl` to the item mapping if useful for LLM consumers.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: update RSS, API, markdown, and OG endpoints for new news schema

RSS uses externalUrl for link posts. JSON API includes type/externalUrl/sourceName.
Markdown frontmatter includes new fields. OG shows source name for link posts."
```

---

## Task 11: Update Manage News Pages

**Files:**
- Modify: `app/routes/manage/news/index.tsx`
- Modify: `app/routes/manage/news/new.tsx`
- Modify: `app/routes/manage/news/edit.tsx`
- Modify: `app/routes/manage/news/delete.tsx`

- [ ] **Step 1: Update manage news index**

Update `app/routes/manage/news/index.tsx`:
- Show type badge (Link / Article) and status badge (Draft / Published / Hidden / Pending Review)
- Add "Submit URL" action that accepts a URL, fetches metadata, and creates a link post
- Keep "New Article" button for original articles

- [ ] **Step 2: Update manage news new/edit**

Update `app/routes/manage/news/new.tsx`:
- Add `type` selector at the top: "Article" or "Link Post"
- When "Link Post" is selected: show URL field, sourceName field, content is optional commentary
- When "Article" is selected: same as before (title, content, excerpt, cover image)
- Both types have publish toggle

Update `app/routes/manage/news/edit.tsx`:
- Same dual mode based on `article.type`
- Display `externalUrl` and `sourceName` for link posts
- Show status selector (Draft / Published / Hidden)

The delete page (`delete.tsx`) needs no changes beyond potentially showing the type.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: update manage news pages for link posts and articles

Type/status badges on listing. Dual-mode create form for articles vs link posts.
Edit form shows link-specific fields. Status management (draft/published/hidden)."
```

---

## Task 12: News Import Management Page

**Files:**
- Create: `app/routes/manage/import/news.tsx`
- Create: `app/routes/manage/import/news.new.tsx`

- [ ] **Step 1: Create import news management page**

Create `app/routes/manage/import/news.tsx` mirroring `app/routes/manage/import/jobs.tsx`:

Structure:
- Loader: fetch all news import sources + all pending news items (using `getAllNewsImportSources()` and `getAllPendingNews()`)
- Action: handle intents `sync` (single source), `sync-all`, `review-news` (approve/hide per item), `hide-all-pending`
- UI:
  - Header with "Sync All" button and "Add Source" link
  - Pending review triage section (same pattern as jobs triage): title, source badge, excerpt, View/Approve/Hide buttons, "Hide All Remaining"
  - Sources table: name, type badge (RSS/Custom), keywords, enabled status, last sync time/status, Sync button per source

- [ ] **Step 2: Create add source page**

Create `app/routes/manage/import/news.new.tsx`:

Form fields:
- Name (text, required)
- Source Type (select: RSS / Custom)
- Source URL (text, required -- RSS feed URL or page URL)
- Source Identifier (text, optional -- for custom scrapers)
- Keywords (text, optional -- comma-separated)
- Enabled (checkbox, default on)

Action: validate with zod, call `createNewsImportSource()`, redirect to `/manage/import/news`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: news import management page with triage UI

Source listing with sync controls, pending review triage with approve/hide,
add source form with keywords support. Mirrors job import page pattern."
```

---

## Task 13: MCP Bridge Functions

**Files:**
- Modify: `app/mcp/bridge.ts`
- Modify: `app/mcp/server.ts`

- [ ] **Step 1: Add news bridge functions**

Add to `app/mcp/bridge.ts`:

```typescript
// ---- News ----

export async function submitNewsLink(url: string, title?: string, excerpt?: string, sourceName?: string) {
  // If title not provided, fetch the page and extract metadata
  if (!title) {
    const response = await fetch(url, { headers: { "User-Agent": "siliconharbour.dev" } });
    const html = await response.text();
    // Extract <title> tag
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
    // Extract meta description
    if (!excerpt) {
      const descMatch = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html);
      excerpt = descMatch ? descMatch[1].trim() : undefined;
    }
  }
  if (!sourceName) {
    sourceName = new URL(url).hostname.replace(/^www\./, "");
  }

  const { createNews } = await import("~/lib/news.server");
  const article = await createNews({
    type: "link",
    title,
    externalUrl: url,
    sourceName,
    content: excerpt || "",
    excerpt: excerpt || null,
    status: "published",
    publishedAt: new Date(),
  });
  return { id: article.id, slug: article.slug, title: article.title };
}

export async function createNewsArticle(
  title: string,
  content: string,
  excerpt?: string,
  publish?: boolean,
) {
  const { createNews } = await import("~/lib/news.server");
  const article = await createNews({
    type: "article",
    title,
    content,
    excerpt: excerpt || null,
    status: publish ? "published" : "draft",
    publishedAt: publish ? new Date() : null,
  });
  return { id: article.id, slug: article.slug, title: article.title };
}

export async function pendingNews() {
  const { getAllPendingNews } = await import("~/lib/news-importers/sync.server");
  return getAllPendingNews();
}

export async function approveNews(id: number) {
  const { approveNewsItem } = await import("~/lib/news-importers/sync.server");
  await approveNewsItem(id);
  return { success: true };
}

export async function hideNews(id: number) {
  const { hideNewsItem } = await import("~/lib/news-importers/sync.server");
  await hideNewsItem(id);
  return { success: true };
}
```

- [ ] **Step 2: Register MCP tools**

Add to `app/mcp/server.ts`:

```typescript
server.tool(
  "submitNewsLink",
  "Submit a link post from an external URL. Auto-extracts title and excerpt if not provided.",
  { url: z.string().url(), title: z.string().optional(), excerpt: z.string().optional(), sourceName: z.string().optional() },
  async ({ url, title, excerpt, sourceName }) => ({
    content: [{ type: "text", text: JSON.stringify(await bridge.submitNewsLink(url, title, excerpt, sourceName), null, 2) }],
  }),
);

server.tool(
  "createNewsArticle",
  "Create an original news article (draft by default).",
  { title: z.string(), content: z.string(), excerpt: z.string().optional(), publish: z.boolean().optional() },
  async ({ title, content, excerpt, publish }) => ({
    content: [{ type: "text", text: JSON.stringify(await bridge.createNewsArticle(title, content, excerpt, publish), null, 2) }],
  }),
);

server.tool(
  "pendingNews",
  "List all news items pending review.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(await bridge.pendingNews(), null, 2) }],
  }),
);

server.tool(
  "approveNews",
  "Approve a pending news item (publish it).",
  { id: z.number() },
  async ({ id }) => ({
    content: [{ type: "text", text: JSON.stringify(await bridge.approveNews(id), null, 2) }],
  }),
);

server.tool(
  "hideNews",
  "Hide a news item.",
  { id: z.number() },
  async ({ id }) => ({
    content: [{ type: "text", text: JSON.stringify(await bridge.hideNews(id), null, 2) }],
  }),
);
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: MCP bridge functions for news

submitNewsLink (auto-extracts metadata), createNewsArticle,
pendingNews, approveNews, hideNews."
```

---

## Task 14: Build Verification & Cleanup

**Files:**
- Modify: `app/routes/manage/index.tsx` (add link to import/news in sidebar if needed)

- [ ] **Step 1: Run lint**

```bash
pnpm run lint:fix
```

Expected: No errors.

- [ ] **Step 2: Run build**

```bash
pnpm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: All tests pass (existing tests should still pass; news had no tests before).

- [ ] **Step 4: Verify routes work**

Start the dev server and verify:
- `/news` loads (empty listing, no errors)
- `/manage/import/news` loads (empty sources list)
- `/manage/news` loads (empty article list)
- `/news.rss` returns valid RSS XML
- `/api/news` returns valid JSON

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "chore: lint fixes and build verification for news aggregator"
```
