# Event Import Sources — Design Spec

**Date:** 2026-04-01  
**Status:** Approved, ready for implementation

---

## Overview

A system for importing events from external sources (Luma, techNL) into SiliconHarbour as full first-class events. Imported events go through a review-and-publish workflow before appearing publicly. The architecture mirrors the existing job import system exactly.

---

## Goals

- Pull events from Luma user accounts and techNL's events page via scraping
- Surface them in a manage UI for review: approve, hide, or ignore
- Approved events enter a private editing stage so they can be enriched before going live
- Once published, they are indistinguishable from manually created events (live on site, in RSS/iCal feeds)
- The source abstraction is extensible — new source types (Luma calendars, iCal URLs, etc.) slot in without schema changes

## Non-Goals

- Luma Plus API integration (deferred — no subscription today)
- Automatic publishing without human review
- Per-field merge tracking (edits always win after approval)
- Recurring event detection from imported sources (all imported events are treated as one-time)

---

## Database Schema

### New table: `event_import_sources`

```sql
CREATE TABLE `event_import_sources` (
  `id`                text PRIMARY KEY,
  `name`              text NOT NULL,           -- human label, e.g. "TechNest Community (Luma)"
  `group_id`          text REFERENCES groups(id),  -- optional, pre-populates organizer on import
  `source_type`       text NOT NULL,           -- "luma-user" | "technl" | (future: "luma-calendar" | "ical-url")
  `source_identifier` text NOT NULL,           -- e.g. "usr-bSGJmqMm6oO62Ze" for luma-user
  `source_url`        text NOT NULL,           -- human-readable reference URL
  `last_fetched_at`   integer,
  `fetch_status`      text NOT NULL DEFAULT 'pending',  -- "pending" | "success" | "error"
  `fetch_error`       text,
  `created_at`        integer NOT NULL,
  `updated_at`        integer NOT NULL
);
```

### New columns on `events`

```sql
ALTER TABLE `events` ADD `import_source_id`  text REFERENCES event_import_sources(id);
ALTER TABLE `events` ADD `external_id`       text;
ALTER TABLE `events` ADD `import_status`     text;
ALTER TABLE `events` ADD `first_seen_at`     integer;
ALTER TABLE `events` ADD `last_seen_at`      integer;
```

Unique constraint: `(import_source_id, external_id)` — deduplication key on re-sync.

**`import_status` values:**

| Value | Meaning |
|---|---|
| `null` | Manually created event — no import lifecycle, always public |
| `pending_review` | Freshly imported, not yet reviewed, invisible to public |
| `approved` | Accepted by admin, in editing stage, still invisible to public |
| `published` | Fully live — visible on site, in RSS and iCal feeds |
| `hidden` | Actively excluded by admin decision |
| `removed` | No longer present in source feed (informational, not shown publicly) |

### Impact on existing queries

`getUpcomingEvents()` and all public-facing event queries gain a filter:

```sql
WHERE import_status IS NULL OR import_status = 'published'
```

Manually created events (`import_status IS NULL`) pass through unchanged. No existing behaviour changes.

---

## Importer Architecture

Location: `app/lib/event-importers/`

### `types.ts`

```ts
export interface FetchedEvent {
  externalId: string        // stable unique ID from source
  title: string
  description: string       // plain text or markdown, best-effort
  location: string
  link: string              // registration/info URL
  organizer: string         // pre-populated from source group name
  startDate: string         // "YYYY-MM-DD"
  endDate: string           // "YYYY-MM-DD"
  startTime: string | null  // "HH:mm"
  endTime: string | null    // "HH:mm"
  coverImageUrl: string | null  // remote URL — downloaded only on approve
  timezone: string | null
}

export interface EventImporter {
  fetchEvents(config: ImportSourceConfig): Promise<FetchedEvent[]>
  validateConfig?(config: ImportSourceConfig): Promise<{ valid: boolean; error?: string }>
}

export interface ImportSourceConfig {
  id: string
  groupId: string | null
  sourceType: string
  sourceIdentifier: string
  sourceUrl: string
}

export interface EventSyncResult {
  success: boolean
  added: number     // new pending_review events created
  skipped: number   // approved/published — untouched (lock rule)
  removed: number   // marked removed (no longer in source feed)
  error?: string
}
```

### `index.ts` — Registry

```ts
const importers: Record<string, EventImporter> = {
  "luma-user": lumaUserImporter,
  "technl": technlImporter,
}

export function getEventImporter(sourceType: string): EventImporter
```

### `luma-user.server.ts`

- Fetches `https://luma.com/user/:sourceIdentifier`
- Extracts `__NEXT_DATA__` JSON embedded in the HTML (same technique as the Ashby job importer)
- For each event stub in the hosted events list, fetches the individual event page (`https://luma.com/:eventSlug`) for full description, times, and cover image URL
- `externalId` = Luma's `api_id` field (e.g. `evt-xxxx`), available in the embedded JSON
- Parses times from the event page's structured data

### `technl.server.ts`

- Fetches `https://technl.ca/news-events/`
- Extracts all `<script type="application/ld+json">` blocks where `@type === "Event"`
- Maps schema.org fields directly to `FetchedEvent`:
  - `name` → `title`
  - `description` → `description`
  - `location.name` + `location.address` → `location`
  - `offers.url` → `link` and also used as `externalId` (stable per event)
  - `startDate` → `startDate`
  - `endDate` → `endDate`
  - `organizer.name` → `organizer`
- No individual page fetching needed — all data is in the JSON-LD

### `sync.server.ts` — Three-way merge algorithm

```
syncEvents(sourceId):
  1. Load source config from DB
  2. Set fetchStatus = "pending"
  3. getEventImporter(sourceType).fetchEvents(config) → FetchedEvent[]
  4. Load all existing events for this sourceId from DB
  5. For each FetchedEvent:
       - Not in DB → insert event + event_dates row, importStatus = "pending_review"
       - In DB, status = "pending_review" → refresh all fields, update lastSeenAt
       - In DB, status = "approved" → update lastSeenAt only (lock rule)
       - In DB, status = "published" → update lastSeenAt only (lock rule)
       - In DB, status = "hidden" → update lastSeenAt only
  6. For each existing "pending_review" event not in current feed → set importStatus = "removed"
  7. Update source: lastFetchedAt, fetchStatus = "success"
  8. Return EventSyncResult
```

Cover images are **not** downloaded at sync time. They are downloaded (and stored via the existing image upload pipeline) only when an admin approves an event, to avoid wasting storage on events that will be hidden or ignored.

---

## Manage UI

### Routes

| Route | Purpose |
|---|---|
| `GET /manage/import/events` | Source list |
| `GET /manage/import/events/new` | Add source form |
| `POST /manage/import/events/new` | Save new source |
| `GET /manage/import/events/:sourceId` | Source detail + review workflow |
| `POST /manage/import/events/:sourceId` | Sync / approve / hide / unhide actions |

These are added to `app/routes.ts` under the existing `manage/import` prefix.

### `/manage/import/events` — Source list

Table with columns: Name, Source Type, Group, Pending count, Active (published) count, Last Fetched, Fetch Status. Per-row "Sync" button (useFetcher POST). "Sync All" button at top. "Add Source" link.

### `/manage/import/events/new` — Add source

Form fields:
- **Name** — free text
- **Source Type** — select: `luma-user` | `technl`
- **Group** — select from existing groups (optional)
- **Source Identifier** — text input (auto-filled/readonly for single-instance types like `technl`)
- **Source URL** — reference URL

On submit: runs `validateConfig()` on the importer before saving (e.g. verifies the Luma user page is reachable). Shows validation error inline if it fails.

### `/manage/import/events/:sourceId` — Source detail

**"Sync Now"** button at top — useFetcher POST with `intent: "sync"`. Result banner shows: "Added: X, Skipped: Y, Removed: Z".

Four sections:

**Pending Review**
- Table: title, date, location, source link (opens Luma/techNL in new tab)
- Per-row actions:
  - **Approve** → sets `importStatus = "approved"`, downloads cover image, redirects to `/manage/events/:id/edit`
  - **Hide** → sets `importStatus = "hidden"`

**Approved (Editing)**
- Events in the `approved` state — accepted but not yet published
- Table: title, date, edit link
- Per-row actions: Edit (→ event edit page), Hide

**Active (Published)**
- Table: title, date, edit link
- Per-row actions: Edit, Hide

**Hidden**
- Table: title, date
- Per-row actions: Unhide (→ back to `pending_review`)

**Removed** (collapsed by default)
- Read-only list of events no longer in the source feed

---

## Event Edit Form Changes

The existing `/manage/events/:id/edit` form gains a **"Save & Publish"** button when the event has `importStatus = "approved"`.

- **"Save"** (existing) — saves changes, `importStatus` stays `approved`, event remains invisible
- **"Save & Publish"** (new, only shown for approved imported events) — saves changes and sets `importStatus = "published"`, making the event live

Once published, the "Save & Publish" button is replaced by the normal "Save" button (re-publishing is not meaningful since edits to published events take effect immediately).

---

## Event Visibility Rules

| `importStatus` | Public site | RSS/iCal | Manage pages |
|---|---|---|---|
| `null` (manual) | Visible | Included | Visible |
| `pending_review` | Hidden | Excluded | Import manage only |
| `approved` | Hidden | Excluded | Import manage + edit |
| `published` | Visible | Included | Everywhere |
| `hidden` | Hidden | Excluded | Import manage only |
| `removed` | Hidden | Excluded | Import manage (collapsed) |

---

## File Layout

```
app/lib/event-importers/
  types.ts
  index.ts
  sync.server.ts
  luma-user.server.ts
  technl.server.ts

app/routes/manage/import/
  events.tsx           (source list)
  events.new.tsx       (add source)
  events.$sourceId.tsx (detail + review)

drizzle/
  0019_add_event_import_sources.sql

app/db/schema.ts       (new table + new columns on events)
app/routes.ts          (register new routes)
app/lib/events.server.ts  (update getUpcomingEvents + public queries)
app/routes/manage/events/edit.tsx  (Save & Publish button)
```

---

## Migration

Migration `0019_add_event_import_sources.sql`:

```sql
CREATE TABLE `event_import_sources` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `group_id` text REFERENCES `groups`(`id`),
  `source_type` text NOT NULL,
  `source_identifier` text NOT NULL,
  `source_url` text NOT NULL,
  `last_fetched_at` integer,
  `fetch_status` text NOT NULL DEFAULT 'pending',
  `fetch_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

ALTER TABLE `events` ADD `import_source_id` text REFERENCES `event_import_sources`(`id`);
ALTER TABLE `events` ADD `external_id` text;
ALTER TABLE `events` ADD `import_status` text;
ALTER TABLE `events` ADD `first_seen_at` integer;
ALTER TABLE `events` ADD `last_seen_at` integer;

CREATE UNIQUE INDEX `events_import_source_id_external_id_unique`
  ON `events` (`import_source_id`, `external_id`)
  WHERE `import_source_id` IS NOT NULL AND `external_id` IS NOT NULL;
```

---

## Open Questions / Future Work

- **Luma Plus API** — if the account upgrades, `luma-calendar` source type can be added using `api.lu.ma/public/v1/calendar/list-events` with an API key. No schema changes needed.
- **iCal URL source type** — generic `ical-url` importer could parse any `.ics` feed. Deferred.
- **Automatic sync scheduling** — currently manual trigger only. Could add a cron/scheduled job later.
- **Image handling on approve** — need to decide whether to re-host the cover image through the existing image pipeline or just store the remote URL. Re-hosting is safer (avoids broken links if source removes image).
