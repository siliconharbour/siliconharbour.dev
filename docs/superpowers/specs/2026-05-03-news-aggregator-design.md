# News Aggregator + Original Articles

## Overview

Replace the existing empty news CMS with a news aggregator for the NL tech ecosystem. The system handles two content types sharing a unified feed:

- **Link posts** (high volume, low effort): curated links to external articles from CBC NL, VOCM, TechNL blog, Genesis blog, Bounce blog, company blogs, etc. Discovered via automated RSS importers or manual URL submission.
- **Original articles** (low volume, high effort): editorial content, announcements, and site updates written directly on siliconharbour.dev.

The existing `news` table is empty in production and will be dropped and rebuilt.

## Data Model

### `news` table (rebuilt)

Unified table for both link posts and original articles.

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK | auto-increment |
| `slug` | text, unique | auto-generated from title |
| `type` | text enum: `link`, `article` | distinguishes link posts from originals |
| `title` | text, not null | article title or external article title |
| `externalUrl` | text, nullable | set for link posts, null for articles |
| `sourceName` | text, nullable | display name: "CBC NL", "TechNL", etc. |
| `content` | text, not null, default `""` | full markdown for articles, brief excerpt/commentary for link posts. Empty string for link posts with no commentary. |
| `excerpt` | text, nullable | short summary for listings/RSS |
| `coverImage` | text, nullable | filename in /images/ |
| `publishedAt` | timestamp, nullable | null = draft |
| `status` | text enum: `draft`, `pending_review`, `published`, `hidden` | workflow status |
| `sourceId` | integer, nullable FK | references `newsImportSources.id`, null for manual/original |
| `sourceItemId` | text, nullable | unique ID from source (RSS guid/URL) for dedup |
| `createdAt` | timestamp | auto-set |
| `updatedAt` | timestamp | auto-set |

Deduplication key: `sourceId + sourceItemId`.

### `newsImportSources` table (new)

Mirrors `jobImportSources`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK | auto-increment |
| `name` | text, not null | display name, e.g. "TechNL Blog" |
| `sourceType` | text enum: `rss`, `custom` | importer type |
| `sourceUrl` | text, not null | RSS feed URL or page URL for scrapers |
| `sourceIdentifier` | text, nullable | opaque config for custom scrapers |
| `keywords` | text, nullable | comma-separated keywords for filtering. Null = import everything |
| `enabled` | integer (boolean) | whether to sync this source |
| `lastSyncAt` | timestamp, nullable | |
| `lastSyncStatus` | text, nullable | `success` or `error` |
| `lastSyncError` | text, nullable | error message if failed |
| `createdAt` | timestamp | auto-set |
| `updatedAt` | timestamp | auto-set |

## Import Architecture

### Source Types

**`rss`** -- Generic RSS/Atom feed fetcher:
- Parses the feed XML (using a lightweight parser)
- Extracts: title, link (becomes `externalUrl`), published date, description/summary (becomes `excerpt`/`content`)
- `sourceItemId` = RSS `<guid>` element, falling back to the article URL
- Works for TechNL blog, Genesis blog, Bounce blog, most company blogs

**`custom`** -- Pluggable scrapers:
- Same pattern as job custom scrapers: a registry of named scraper functions
- `sourceIdentifier` contains the scraper name and any config
- Each scraper returns `FetchedNewsItem[]` with the same shape as RSS items
- For sites like VOCM that lack RSS feeds

### Sync Algorithm

For each enabled source:

1. Fetch new items via the appropriate importer (RSS parser or custom scraper)
2. If source has `keywords` set, filter items: title or excerpt must contain at least one keyword (case-insensitive substring match). Sources with null keywords import everything.
3. Deduplicate against existing items by `sourceId + sourceItemId`
4. New items: insert with `status: "pending_review"`, `type: "link"`, `sourceName` set from the source's `name` field
5. Existing items: update title/excerpt if changed, don't touch status
6. Items that disappear from the feed: leave them alone (news doesn't expire like job listings)

Return sync result counts: added, updated, unchanged, filtered.

### Manual URL Submission

Via MCP bridge or manage UI:
- Accept a URL
- Fetch the page, extract title + excerpt + source domain (using defuddle or HTML metadata)
- Create a link post with `type: "link"`, `status: "published"` (or `"draft"` if desired)
- No `sourceId` since it's not from an import source
- `sourceName` derived from the domain (e.g. "cbc.ca" -> "CBC")

## Public UI

### Listing Page (`/news`)

Unified feed of both link posts and articles, sorted by `publishedAt` desc.

**Link posts display:**
- Title as a link to the external URL (opens in same tab, standard web behavior)
- Source name badge (e.g. "CBC NL", "TechNL")
- Published date
- Excerpt if available
- Small permalink icon linking to the siliconharbour.dev detail page (`/news/:slug`)

**Articles display:**
- Title links to `/news/:slug`
- Cover image if present
- Published date
- Excerpt

**Filter tabs:** All | Links | Articles

Replaces the current announcement/general/editorial/meta tabs. Search works across both types.

### Detail Page (`/news/:slug`)

**For articles:** Full markdown content, cover image, comments, backlinks. Same as current.

**For link posts:** Lightweight page with:
- Title
- Source name + external link
- Excerpt
- Prominent "Read on [source]" button
- Published date
- Comments and backlinks available (mainly exists as a permalink for RSS/API/sharing)

### Other Endpoints

All existing endpoints adapted to the new schema:
- **RSS feed** (`/news.rss`): Items for link posts include the external URL
- **JSON API** (`/api/news`, `/api/news/:slug`): Include `type`, `externalUrl`, `sourceName` fields
- **Markdown** (`/news.md`, `/news/:slug.md`): Same adaptations
- **OG images** (`/news/:slug.png`): Work for both types

Re-enable the "News" nav link once content is flowing (via section visibility toggle in settings).

## Manage UI

### `/manage/import/news` (new page)

Mirrors `/manage/import/jobs`:

- **Sources table:** List of configured news import sources with name, type badge (RSS/Custom), enabled status, last sync time/status
- **Sync controls:** Sync per-source and Sync All buttons
- **Pending review triage:** Section at top showing all `pending_review` news items with:
  - Title, source badge, excerpt preview
  - Link to view external article
  - Approve / Hide buttons per item
  - "Hide All Remaining" bulk action
- **Add Source:** Form with name, source type, URL, keywords (optional), enabled checkbox

### `/manage/news` (updated)

- List of all news items (both link posts and articles) with type badge, status badge, published date
- **New Article** button (creates `type: "article"`)
- **Submit URL** form/button (creates `type: "link"` manually -- fetches metadata from URL)
- Edit/delete for any news item

### MCP Bridge Functions

- `submitNewsLink(url)` -- paste URL, auto-extract title/excerpt/source, create as published link post
- `createNewsArticle(title, content, ...)` -- create an original article draft
- `pendingNews()` -- list pending review items with source info
- `approveNews(id)` / `hideNews(id)` -- triage actions

## Initial Sources

**RSS, auto-import everything (no keywords):**
- TechNL blog
- Genesis Centre blog
- Bounce Health Innovation blog
- Company engineering/tech blogs as discovered

**RSS, keyword-filtered:**
- CBC NL -- keywords: tech, startup, digital, innovation, software, AI, venture, funding, TechNL, Genesis, Bounce (configurable, add more as needed)

**Custom scraper (if no RSS available):**
- VOCM -- check for RSS first, build scraper if needed, with keyword filtering

The exact source list is configuration -- added through the manage UI as the system runs. The architecture supports adding sources at any time.

## Migration Notes

- Drop the existing `news` table (empty in production, safe to nuke)
- Create new `news` table with the schema above
- Create new `newsImportSources` table
- Update `newsTypes` enum in schema.ts from `["announcement", "general", "editorial", "meta"]` to `["link", "article"]`
- Update Drizzle journal with new migration entry
- Existing news-related code (routes, server functions, components, API, RSS, OG) all need updating to match the new schema
- References system (`contentTypes` includes "news"), comments system (`commentableKeys`), and section visibility (`sectionKeys`) all continue to work -- just need schema alignment
- FTS search entries for news will need rebuilding (but there are none in prod)
