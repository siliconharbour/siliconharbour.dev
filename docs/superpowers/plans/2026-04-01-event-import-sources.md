# Event Import Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a job-importer-style system for pulling events from Luma user pages and the techNL events page into SiliconHarbour as full first-class events, with a pending_review → approved → published workflow.

**Architecture:** Mirror the existing `app/lib/job-importers/` pattern exactly — a typed `EventImporter` interface, a registry in `index.ts`, per-source scraper files, a `sync.server.ts` with the three-way merge algorithm, and three manage routes under `/manage/import/events`. New `event_import_sources` table tracks sources; five new columns on `events` track import lifecycle. Public event queries filter to `importStatus IS NULL OR importStatus = 'published'`.

**Tech Stack:** Drizzle ORM (SQLite), React Router v7 loaders/actions, linkedom for HTML parsing, `fetchPage` utility from job-importer custom utils, `fetchImage`/`processAndSaveCoverImage` from existing image pipeline, Tailwind CSS with harbour-* design system (no rounded corners, no shadows).

---

## File Map

**New files:**
- `drizzle/0039_add_event_import_sources.sql` — migration
- `app/lib/event-importers/types.ts` — interfaces
- `app/lib/event-importers/index.ts` — registry
- `app/lib/event-importers/sync.server.ts` — sync algorithm + DB helpers
- `app/lib/event-importers/luma-user.server.ts` — Luma user page scraper
- `app/lib/event-importers/technl.server.ts` — techNL JSON-LD scraper
- `app/routes/manage/import/events.tsx` — source list page
- `app/routes/manage/import/events.new.tsx` — add source form
- `app/routes/manage/import/events.$sourceId.tsx` — source detail + review workflow

**Modified files:**
- `app/db/schema.ts` — new `eventImportSources` table + 5 new columns on `events`
- `app/routes.ts` — register 3 new manage/import/events routes
- `app/lib/events.server.ts` — add `importStatus` filter to all public-facing queries
- `app/routes/manage/events/edit.tsx` — add "Save & Publish" button for approved events

---

## Task 1: Database Migration

**Files:**
- Create: `drizzle/0039_add_event_import_sources.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Create the migration SQL file**

Create `drizzle/0039_add_event_import_sources.sql`:

```sql
CREATE TABLE `event_import_sources` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `group_id` integer REFERENCES `groups`(`id`),
  `source_type` text NOT NULL,
  `source_identifier` text NOT NULL,
  `source_url` text NOT NULL,
  `last_fetched_at` integer,
  `fetch_status` text NOT NULL DEFAULT 'pending',
  `fetch_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

ALTER TABLE `events` ADD `import_source_id` integer REFERENCES `event_import_sources`(`id`);
ALTER TABLE `events` ADD `external_id` text;
ALTER TABLE `events` ADD `import_status` text;
ALTER TABLE `events` ADD `first_seen_at` integer;
ALTER TABLE `events` ADD `last_seen_at` integer;

CREATE UNIQUE INDEX `events_import_source_external_id_unique`
  ON `events` (`import_source_id`, `external_id`)
  WHERE `import_source_id` IS NOT NULL AND `external_id` IS NOT NULL;
```

- [ ] **Step 2: Add journal entry**

In `drizzle/meta/_journal.json`, append to the `entries` array:

```json
{
  "idx": 39,
  "version": "6",
  "when": 1743523200000,
  "tag": "0039_add_event_import_sources",
  "breakpoints": true
}
```

- [ ] **Step 3: Run the migration**

```bash
pnpm run db:migrate
```

Expected output: migration runs without error. Verify:

```bash
sqlite3 ./data/siliconharbour.db ".tables" | tr ' ' '\n' | sort | grep event
```

Expected: `event_import_sources` appears in the list, alongside `event_dates`, `event_occurrences`, `events`.

- [ ] **Step 4: Update `app/db/schema.ts` — add `eventImportSources` table**

Open `app/db/schema.ts`. After the last import line and before the first `sqliteTable` call, add the import for `references`. Then add the new table after the existing `eventOccurrences` table definition. Find the block ending with `eventOccurrences` and add:

```typescript
export const eventImportSources = sqliteTable("event_import_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  groupId: integer("group_id").references(() => groups.id),
  sourceType: text("source_type").notNull(),
  sourceIdentifier: text("source_identifier").notNull(),
  sourceUrl: text("source_url").notNull(),
  lastFetchedAt: integer("last_fetched_at", { mode: "timestamp" }),
  fetchStatus: text("fetch_status").notNull().default("pending"),
  fetchError: text("fetch_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type EventImportSource = typeof eventImportSources.$inferSelect;
export type NewEventImportSource = typeof eventImportSources.$inferInsert;
```

Note: `groups` is defined later in the file. Move `eventImportSources` to after the `groups` table definition to avoid forward reference issues, OR use a lazy reference. Check the file and place it after `groups`.

- [ ] **Step 5: Add 5 new columns to the `events` table in schema.ts**

In the `events` table definition, add these columns after `updatedAt`:

```typescript
  importSourceId: integer("import_source_id").references(() => eventImportSources.id),
  externalId: text("external_id"),
  importStatus: text("import_status"),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp" }),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
```

Since `eventImportSources` is defined after `events`, use a function reference:

```typescript
  importSourceId: integer("import_source_id").references((): AnySQLiteColumn => eventImportSources.id),
```

Import `AnySQLiteColumn` from `drizzle-orm/sqlite-core`.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
pnpm run build 2>&1 | head -40
```

Expected: no errors related to schema.ts. Fix any type errors before proceeding.

- [ ] **Step 7: Commit**

```bash
git add drizzle/0039_add_event_import_sources.sql drizzle/meta/_journal.json app/db/schema.ts
git commit -m "feat: add event_import_sources table and import columns to events"
```

---

## Task 2: Importer Types and Registry

**Files:**
- Create: `app/lib/event-importers/types.ts`
- Create: `app/lib/event-importers/index.ts`

- [ ] **Step 1: Create `app/lib/event-importers/types.ts`**

```typescript
export interface FetchedEvent {
  externalId: string;
  title: string;
  description: string;
  location: string;
  link: string;
  organizer: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  startTime: string | null; // "HH:mm"
  endTime: string | null;   // "HH:mm"
  coverImageUrl: string | null;
  timezone: string | null;
}

export interface ImportSourceConfig {
  id: number;
  groupId: number | null;
  sourceType: string;
  sourceIdentifier: string;
  sourceUrl: string;
}

export interface EventSyncResult {
  success: boolean;
  added: number;
  skipped: number;
  removed: number;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  eventCount?: number;
}

export interface EventImporter {
  readonly sourceType: string;
  fetchEvents(config: ImportSourceConfig): Promise<FetchedEvent[]>;
  validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult>;
}

export const sourceTypeLabels: Record<string, string> = {
  "luma-user": "Luma (User)",
  "technl": "techNL",
};
```

- [ ] **Step 2: Create `app/lib/event-importers/index.ts`** (stub — real importers added in Tasks 3 & 4)

```typescript
import type { EventImporter } from "./types";

// Importers registered here after implementation
const importers: Record<string, EventImporter> = {};

export function getEventImporter(sourceType: string): EventImporter {
  const importer = importers[sourceType];
  if (!importer) {
    throw new Error(`No event importer found for source type: ${sourceType}`);
  }
  return importer;
}

export function hasEventImporter(sourceType: string): boolean {
  return sourceType in importers;
}

export function getAvailableSourceTypes(): string[] {
  return Object.keys(importers);
}

export * from "./types";
```

- [ ] **Step 3: Commit**

```bash
git add app/lib/event-importers/
git commit -m "feat: add event importer types and registry stub"
```

---

## Task 3: Sync Server

**Files:**
- Create: `app/lib/event-importers/sync.server.ts`

This is the core DB layer and three-way merge algorithm.

- [ ] **Step 1: Create `app/lib/event-importers/sync.server.ts`**

```typescript
/**
 * Event Import Sync Logic
 * Handles the sync algorithm for importing events from external sources.
 * Mirrors app/lib/job-importers/sync.server.ts in structure.
 */

import { db } from "~/db";
import { eventImportSources, events, eventDates, groups } from "~/db/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import { generateEventSlug } from "~/lib/events.server";
import { fetchImage } from "~/lib/scraper.server";
import { processAndSaveCoverImage } from "~/lib/images.server";
import type { EventSyncResult, ImportSourceConfig, FetchedEvent } from "./types";
import { getEventImporter } from "./index";

// =============================================================================
// Source CRUD
// =============================================================================

export async function getAllEventImportSources() {
  const sources = await db.select().from(eventImportSources);

  // Enrich with pending/published counts
  return Promise.all(
    sources.map(async (source) => {
      const allEvents = await db
        .select({ importStatus: events.importStatus })
        .from(events)
        .where(eq(events.importSourceId, source.id));

      const pendingCount = allEvents.filter((e) => e.importStatus === "pending_review").length;
      const publishedCount = allEvents.filter((e) => e.importStatus === "published").length;

      return { ...source, pendingCount, publishedCount };
    }),
  );
}

export async function getEventImportSourceById(sourceId: number) {
  const [source] = await db
    .select()
    .from(eventImportSources)
    .where(eq(eventImportSources.id, sourceId))
    .limit(1);
  return source ?? null;
}

export async function getEventImportSourceWithStats(sourceId: number) {
  const source = await getEventImportSourceById(sourceId);
  if (!source) return null;

  const allEvents = await db
    .select()
    .from(events)
    .where(eq(events.importSourceId, sourceId));

  const pending = allEvents.filter((e) => e.importStatus === "pending_review");
  const approved = allEvents.filter((e) => e.importStatus === "approved");
  const published = allEvents.filter((e) => e.importStatus === "published");
  const hidden = allEvents.filter((e) => e.importStatus === "hidden");
  const removed = allEvents.filter((e) => e.importStatus === "removed");

  let group = null;
  if (source.groupId) {
    const [g] = await db.select().from(groups).where(eq(groups.id, source.groupId)).limit(1);
    group = g ?? null;
  }

  return { ...source, group, pending, approved, published, hidden, removed };
}

export async function createEventImportSource(data: {
  name: string;
  groupId: number | null;
  sourceType: string;
  sourceIdentifier: string;
  sourceUrl: string;
}) {
  const now = new Date();
  const [source] = await db
    .insert(eventImportSources)
    .values({ ...data, createdAt: now, updatedAt: now })
    .returning();
  return source;
}

export async function deleteEventImportSource(sourceId: number) {
  await db.delete(eventImportSources).where(eq(eventImportSources.id, sourceId));
}

// =============================================================================
// Event import status helpers
// =============================================================================

export async function approveImportedEvent(eventId: number) {
  await db
    .update(events)
    .set({ importStatus: "approved", updatedAt: new Date() })
    .where(eq(events.id, eventId));
}

export async function publishImportedEvent(eventId: number) {
  await db
    .update(events)
    .set({ importStatus: "published", updatedAt: new Date() })
    .where(eq(events.id, eventId));
}

export async function hideImportedEvent(eventId: number) {
  await db
    .update(events)
    .set({ importStatus: "hidden", updatedAt: new Date() })
    .where(eq(events.id, eventId));
}

export async function unhideImportedEvent(eventId: number) {
  await db
    .update(events)
    .set({ importStatus: "pending_review", updatedAt: new Date() })
    .where(eq(events.id, eventId));
}

// =============================================================================
// Cover image download on approve
// =============================================================================

export async function downloadAndSaveCoverImage(imageUrl: string): Promise<string | null> {
  try {
    const buffer = await fetchImage(imageUrl);
    if (!buffer) return null;
    return await processAndSaveCoverImage(buffer);
  } catch {
    return null;
  }
}

// =============================================================================
// Sync algorithm
// =============================================================================

async function updateSourceMeta(
  sourceId: number,
  data: { fetchStatus: "pending" | "success" | "error"; lastFetchedAt?: Date; fetchError?: string | null },
) {
  await db
    .update(eventImportSources)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(eventImportSources.id, sourceId));
}

async function getEventsBySourceId(sourceId: number) {
  return db.select().from(events).where(eq(events.importSourceId, sourceId));
}

async function insertImportedEvent(
  sourceId: number,
  groupId: number | null,
  fetched: FetchedEvent,
): Promise<number> {
  const now = new Date();
  const slug = await generateEventSlug(fetched.title);

  const [newEvent] = await db
    .insert(events)
    .values({
      slug,
      title: fetched.title,
      description: fetched.description,
      location: fetched.location ?? "",
      link: fetched.link,
      organizer: fetched.organizer,
      importSourceId: sourceId,
      externalId: fetched.externalId,
      importStatus: "pending_review",
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: events.id });

  // Insert event_dates row
  const startDate = new Date(fetched.startDate + (fetched.startTime ? `T${fetched.startTime}:00` : "T00:00:00"));
  const endDate = fetched.endDate
    ? new Date(fetched.endDate + (fetched.endTime ? `T${fetched.endTime}:00` : "T23:59:59"))
    : null;

  await db.insert(eventDates).values({
    eventId: newEvent.id,
    startDate,
    endDate,
  });

  return newEvent.id;
}

async function refreshPendingEvent(eventId: number, fetched: FetchedEvent) {
  const now = new Date();
  await db
    .update(events)
    .set({
      title: fetched.title,
      description: fetched.description,
      location: fetched.location ?? "",
      link: fetched.link,
      organizer: fetched.organizer,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(events.id, eventId));

  // Update event_dates
  const [existingDate] = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, eventId))
    .limit(1);

  const startDate = new Date(fetched.startDate + (fetched.startTime ? `T${fetched.startTime}:00` : "T00:00:00"));
  const endDate = fetched.endDate
    ? new Date(fetched.endDate + (fetched.endTime ? `T${fetched.endTime}:00` : "T23:59:59"))
    : null;

  if (existingDate) {
    await db
      .update(eventDates)
      .set({ startDate, endDate })
      .where(eq(eventDates.id, existingDate.id));
  } else {
    await db.insert(eventDates).values({ eventId, startDate, endDate });
  }
}

export async function syncEvents(sourceId: number): Promise<EventSyncResult> {
  const source = await getEventImportSourceById(sourceId);
  if (!source) {
    return { success: false, error: "Source not found", added: 0, skipped: 0, removed: 0 };
  }

  await updateSourceMeta(sourceId, { fetchStatus: "pending", fetchError: null });

  try {
    const importer = getEventImporter(source.sourceType);
    const config: ImportSourceConfig = {
      id: source.id,
      groupId: source.groupId,
      sourceType: source.sourceType,
      sourceIdentifier: source.sourceIdentifier,
      sourceUrl: source.sourceUrl,
    };

    const fetchedEvents = await importer.fetchEvents(config);
    const fetchedIds = new Set(fetchedEvents.map((e) => e.externalId));
    const existingEvents = await getEventsBySourceId(sourceId);
    const existingByExternalId = new Map(existingEvents.map((e) => [e.externalId, e]));

    const now = new Date();
    const results = { added: 0, skipped: 0, removed: 0 };

    for (const fetched of fetchedEvents) {
      const existing = existingByExternalId.get(fetched.externalId);

      if (!existing) {
        // New event — insert as pending_review
        await insertImportedEvent(sourceId, source.groupId, fetched);
        results.added++;
      } else if (existing.importStatus === "pending_review") {
        // Still pending — refresh fields from source
        await refreshPendingEvent(existing.id, fetched);
      } else {
        // approved / published / hidden — lock rule: only update lastSeenAt
        await db
          .update(events)
          .set({ lastSeenAt: now, updatedAt: now })
          .where(eq(events.id, existing.id));
        results.skipped++;
      }
    }

    // Mark pending events no longer in feed as removed
    for (const existing of existingEvents) {
      if (
        existing.importStatus === "pending_review" &&
        existing.externalId &&
        !fetchedIds.has(existing.externalId)
      ) {
        await db
          .update(events)
          .set({ importStatus: "removed", updatedAt: now })
          .where(eq(events.id, existing.id));
        results.removed++;
      }
    }

    await updateSourceMeta(sourceId, {
      fetchStatus: "success",
      lastFetchedAt: now,
      fetchError: null,
    });

    return { success: true, ...results };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSourceMeta(sourceId, { fetchStatus: "error", fetchError: message });
    return { success: false, error: message, added: 0, skipped: 0, removed: 0 };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/event-importers/sync.server.ts
git commit -m "feat: add event import sync server"
```

---

## Task 4: techNL Importer

**Files:**
- Create: `app/lib/event-importers/technl.server.ts`
- Modify: `app/lib/event-importers/index.ts`

- [ ] **Step 1: Create `app/lib/event-importers/technl.server.ts`**

```typescript
/**
 * techNL Event Importer
 * Scrapes https://technl.ca/news-events/ and extracts schema.org/Event JSON-LD blocks.
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

const TECHNL_EVENTS_URL = "https://technl.ca/news-events/";

interface SchemaOrgEvent {
  "@type": string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: {
    "@type"?: string;
    name?: string;
    address?: string;
  };
  organizer?: {
    "@type"?: string;
    name?: string;
  };
  offers?: {
    url?: string;
  };
  url?: string;
}

async function fetchTechNLEvents(): Promise<FetchedEvent[]> {
  const response = await fetch(TECHNL_EVENTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch techNL events page: ${response.status}`);
  }
  const html = await response.text();

  // Extract all JSON-LD script blocks
  const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  const fetched: FetchedEvent[] = [];
  let match: RegExpExecArray | null;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data: SchemaOrgEvent = JSON.parse(match[1]);
      if (data["@type"] !== "Event") continue;

      const title = data.name?.trim() ?? "";
      if (!title) continue;

      const registrationUrl = data.offers?.url ?? data.url ?? "";
      if (!registrationUrl) continue;

      // Use registration URL as stable externalId (it's unique per event on techNL)
      const externalId = registrationUrl;

      const description = data.description?.trim() ?? "";
      const locationName = data.location?.name?.trim() ?? "";
      const locationAddress = data.location?.address?.trim() ?? "";
      const location = [locationName, locationAddress].filter(Boolean).join(", ");
      const organizer = data.organizer?.name?.trim() ?? "techNL";

      // Parse date — techNL provides "YYYY-MM-DD" strings
      const startDate = data.startDate ?? "";
      const endDate = data.endDate ?? startDate;
      if (!startDate) continue;

      fetched.push({
        externalId,
        title,
        description,
        location,
        link: registrationUrl,
        organizer,
        startDate,
        endDate,
        startTime: null, // techNL JSON-LD doesn't include times (only full dates)
        endTime: null,
        coverImageUrl: null,
        timezone: "America/St_Johns",
      });
    } catch {
      // Skip malformed JSON-LD blocks
    }
  }

  return fetched;
}

export const technlImporter: EventImporter = {
  sourceType: "technl",

  async fetchEvents(_config: ImportSourceConfig): Promise<FetchedEvent[]> {
    return fetchTechNLEvents();
  },

  async validateConfig(_config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    try {
      const events = await fetchTechNLEvents();
      return { valid: true, eventCount: events.length };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to fetch techNL events",
      };
    }
  },
};
```

- [ ] **Step 2: Register techNL importer in `app/lib/event-importers/index.ts`**

Replace the stub content:

```typescript
import type { EventImporter } from "./types";
import { lumaUserImporter } from "./luma-user.server";
import { technlImporter } from "./technl.server";

const importers: Record<string, EventImporter> = {
  "luma-user": lumaUserImporter,
  "technl": technlImporter,
};

export function getEventImporter(sourceType: string): EventImporter {
  const importer = importers[sourceType];
  if (!importer) {
    throw new Error(`No event importer found for source type: ${sourceType}`);
  }
  return importer;
}

export function hasEventImporter(sourceType: string): boolean {
  return sourceType in importers;
}

export function getAvailableSourceTypes(): string[] {
  return Object.keys(importers);
}

export * from "./types";
```

Note: this import will fail until Task 5 creates `luma-user.server.ts`. Add a stub for now:

```typescript
// Temporary stub — replaced in Task 5
export const lumaUserImporter: EventImporter = {
  sourceType: "luma-user",
  async fetchEvents() { return []; },
  async validateConfig() { return { valid: false, error: "Not yet implemented" }; },
};
```

Keep the stub at the top of `index.ts` until Task 5.

- [ ] **Step 3: Verify build compiles**

```bash
pnpm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no errors in event-importer files.

- [ ] **Step 4: Commit**

```bash
git add app/lib/event-importers/technl.server.ts app/lib/event-importers/index.ts
git commit -m "feat: add techNL event importer"
```

---

## Task 5: Luma User Importer

**Files:**
- Create: `app/lib/event-importers/luma-user.server.ts`
- Modify: `app/lib/event-importers/index.ts`

- [ ] **Step 1: Create `app/lib/event-importers/luma-user.server.ts`**

```typescript
/**
 * Luma User Account Event Importer
 *
 * Luma embeds event data as JSON in __NEXT_DATA__ on user profile pages.
 * We fetch the user page, extract hosted event stubs, then fetch each
 * individual event page for full details.
 *
 * No API key required — uses public HTML pages only.
 */

import type { EventImporter, ImportSourceConfig, FetchedEvent, ValidationResult } from "./types";

const LUMA_BASE = "https://luma.com";

interface LumaNextData {
  props?: {
    pageProps?: {
      initialData?: {
        events_hosted?: LumaEventStub[];
        user?: { name?: string };
      };
    };
  };
}

interface LumaEventStub {
  api_id: string;
  event?: {
    api_id?: string;
    name?: string;
    start_at?: string;
    end_at?: string;
    cover_url?: string;
    location_type?: string;
    url?: string;
  };
  calendar?: {
    name?: string;
    slug?: string;
  };
}

interface LumaEventDetail {
  event?: {
    api_id?: string;
    name?: string;
    description?: string;
    start_at?: string;
    end_at?: string;
    cover_url?: string;
    location_type?: string;
  };
  geo_address_info?: {
    full_address?: string;
    city?: string;
  };
  calendar?: {
    name?: string;
  };
}

function extractNextData<T>(html: string): T | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

function parseISOToDateAndTime(isoString: string | undefined): {
  date: string;
  time: string | null;
} {
  if (!isoString) return { date: "", time: null };
  try {
    const d = new Date(isoString);
    const date = d.toISOString().split("T")[0]; // "YYYY-MM-DD"
    const hours = d.getUTCHours().toString().padStart(2, "0");
    const minutes = d.getUTCMinutes().toString().padStart(2, "0");
    const time = `${hours}:${minutes}`;
    return { date, time };
  } catch {
    return { date: "", time: null };
  }
}

async function fetchLumaPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)",
      Accept: "text/html",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchEventDetails(eventSlug: string): Promise<LumaEventDetail | null> {
  try {
    const html = await fetchLumaPage(`${LUMA_BASE}/${eventSlug}`);
    const data = extractNextData<{ props?: { pageProps?: { initialData?: LumaEventDetail } } }>(html);
    return data?.props?.pageProps?.initialData ?? null;
  } catch {
    return null;
  }
}

async function fetchUserEvents(userApiId: string): Promise<FetchedEvent[]> {
  const html = await fetchLumaPage(`${LUMA_BASE}/user/${userApiId}`);
  const nextData = extractNextData<LumaNextData>(html);

  const hostedEvents = nextData?.props?.pageProps?.initialData?.events_hosted ?? [];
  const userName = nextData?.props?.pageProps?.initialData?.user?.name ?? "Unknown";

  const results: FetchedEvent[] = [];

  for (const stub of hostedEvents) {
    const ev = stub.event;
    if (!ev?.api_id) continue;

    // The event URL slug on Luma is typically the calendar slug or a short ID
    // Try fetching the event detail page using the event url field if available
    const eventUrl = ev.url ?? ev.api_id;
    const detail = await fetchEventDetails(eventUrl);

    const externalId = ev.api_id;
    const title = detail?.event?.name ?? ev.name ?? "";
    if (!title) continue;

    const description = detail?.event?.description ?? "";
    const location =
      detail?.geo_address_info?.full_address ??
      detail?.geo_address_info?.city ??
      (ev.location_type === "online" ? "Online" : "");
    const organizer = detail?.calendar?.name ?? stub.calendar?.name ?? userName;
    const link = `${LUMA_BASE}/${eventUrl}`;
    const coverImageUrl = detail?.event?.cover_url ?? ev.cover_url ?? null;

    const { date: startDate, time: startTime } = parseISOToDateAndTime(
      detail?.event?.start_at ?? ev.start_at,
    );
    const { date: endDate, time: endTime } = parseISOToDateAndTime(
      detail?.event?.end_at ?? ev.end_at,
    );

    if (!startDate) continue;

    results.push({
      externalId,
      title,
      description,
      location,
      link,
      organizer,
      startDate,
      endDate: endDate || startDate,
      startTime,
      endTime,
      coverImageUrl,
      timezone: "America/St_Johns",
    });
  }

  return results;
}

export const lumaUserImporter: EventImporter = {
  sourceType: "luma-user",

  async fetchEvents(config: ImportSourceConfig): Promise<FetchedEvent[]> {
    return fetchUserEvents(config.sourceIdentifier);
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    try {
      const events = await fetchUserEvents(config.sourceIdentifier);
      return { valid: true, eventCount: events.length };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Failed to fetch Luma user events",
      };
    }
  },
};
```

- [ ] **Step 2: Replace the stub in `app/lib/event-importers/index.ts`**

Remove the inline stub for `lumaUserImporter` at the top of `index.ts` — it's now a real import from `./luma-user.server`. The file should now be exactly:

```typescript
import type { EventImporter } from "./types";
import { lumaUserImporter } from "./luma-user.server";
import { technlImporter } from "./technl.server";

const importers: Record<string, EventImporter> = {
  "luma-user": lumaUserImporter,
  "technl": technlImporter,
};

export function getEventImporter(sourceType: string): EventImporter {
  const importer = importers[sourceType];
  if (!importer) {
    throw new Error(`No event importer found for source type: ${sourceType}`);
  }
  return importer;
}

export function hasEventImporter(sourceType: string): boolean {
  return sourceType in importers;
}

export function getAvailableSourceTypes(): string[] {
  return Object.keys(importers);
}

export * from "./types";
```

- [ ] **Step 3: Verify build compiles**

```bash
pnpm run build 2>&1 | grep -E "^.*error" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/event-importers/luma-user.server.ts app/lib/event-importers/index.ts
git commit -m "feat: add Luma user account event importer"
```

---

## Task 6: Update Public Event Queries

**Files:**
- Modify: `app/lib/events.server.ts`

All public-facing event queries must be updated to filter out unpublished imported events. The filter is: `importStatus IS NULL OR importStatus = 'published'`.

- [ ] **Step 1: Add `isNull` and `or` to the drizzle-orm import in `events.server.ts`**

Find the existing import line:

```typescript
import { eq, gte, and, lte, asc, desc } from "drizzle-orm";
```

Replace with:

```typescript
import { eq, gte, and, lte, asc, desc, isNull, or } from "drizzle-orm";
```

- [ ] **Step 2: Add a helper filter constant**

After the imports, add:

```typescript
/** Filter expression: show manually-created events (importStatus IS NULL) and published imports */
const isPubliclyVisible = or(isNull(events.importStatus), eq(events.importStatus, "published"));
```

- [ ] **Step 3: Update `getUpcomingEvents()`**

In `getUpcomingEvents()` (line ~212), the query for `recurringEventsResult` currently is:

```typescript
  const recurringEventsResult = await db
    .select()
    .from(events)
    .where(gte(events.recurrenceRule, ""));
```

Replace with:

```typescript
  const recurringEventsResult = await db
    .select()
    .from(events)
    .where(and(gte(events.recurrenceRule, ""), isPubliclyVisible));
```

The `upcomingEventIds` query uses `eventDates` — filter imported events at the `getEventById` level by filtering the fetched events after loading. After the `eventsWithDates` parallel map, the existing `.filter((e): e is EventWithDates => e !== null)` line — add an additional filter:

```typescript
  return eventsWithDates
    .filter((e): e is EventWithDates => e !== null)
    .filter((e) => e.importStatus === null || e.importStatus === "published")
    .filter((e) => e.dates.some((d) => d.startDate >= now))
    .sort(/* existing sort */);
```

- [ ] **Step 4: Update `getEventsThisWeek()`**

After the `eventsWithDates` parallel map (line ~401), add the same filter:

```typescript
  return eventsWithDates
    .filter((e): e is EventWithDates => e !== null)
    .filter((e) => e.importStatus === null || e.importStatus === "published")
    .sort(/* existing sort */);
```

- [ ] **Step 5: Update `getEventsByMonth()`**

After the `eventsWithDates` parallel map (line ~428), add:

```typescript
  return eventsWithDates
    .filter((e): e is EventWithDates => e !== null)
    .filter((e) => e.importStatus === null || e.importStatus === "published");
```

- [ ] **Step 6: Update `getEventsForMonth()`**

This function exists around line 301. It also queries `eventDates` and joins to `events`. After loading events, add the same `importStatus` filter.

Find the return/filter step and add:

```typescript
.filter((e) => e.importStatus === null || e.importStatus === "published")
```

- [ ] **Step 7: Update `getPaginatedEvents()`**

In `getPaginatedEvents()` (line ~448), the `recurringEventsResult` query:

```typescript
  const recurringEventsResult = await db
    .select()
    .from(events)
    .where(gte(events.recurrenceRule, ""));
```

Replace with:

```typescript
  const recurringEventsResult = await db
    .select()
    .from(events)
    .where(and(gte(events.recurrenceRule, ""), isPubliclyVisible));
```

After fetching individual events in the parallel map, add the visibility filter before sorting:

```typescript
  const visible = eventsWithDates
    .filter((e): e is EventWithDates => e !== null)
    .filter((e) => e.importStatus === null || e.importStatus === "published");
  // ... rest of sort/pagination uses `visible` instead of `eventsWithDates`
```

- [ ] **Step 8: Verify build**

```bash
pnpm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -20
```

Expected: no errors in events.server.ts.

- [ ] **Step 9: Commit**

```bash
git add app/lib/events.server.ts
git commit -m "feat: filter unpublished imported events from all public event queries"
```

---

## Task 7: Event Edit Form — Save & Publish

**Files:**
- Modify: `app/routes/manage/events/edit.tsx`

Add a "Save & Publish" button that appears when `event.importStatus === 'approved'`. On submit, sets `importStatus = 'published'` and redirects back to the import source page.

- [ ] **Step 1: Update the loader to expose `importSourceId` and `importStatus`**

The loader already returns the full `event` object including the new columns. No changes needed to the loader — the new schema columns will be available on `event`.

- [ ] **Step 2: Update the action to handle `intent: "save-and-publish"`**

In `edit.tsx`, find the action function. After the existing `parseEventBaseForm` call and before the `isRecurring` branch, add intent detection:

```typescript
  const intent = formData.get("intent");
```

After the two `updateEvent` calls (both the recurring and one-time branches), replace the redirect:

```typescript
  // If saving + publishing an imported event, set importStatus to published
  if (intent === "save-and-publish") {
    await db
      .update(events)
      .set({ importStatus: "published", updatedAt: new Date() })
      .where(eq(events.id, id));

    // Redirect back to the import source page if we know it
    if (existingEvent.importSourceId) {
      return redirect(`/manage/import/events/${existingEvent.importSourceId}`);
    }
  }

  return redirect("/manage/events");
```

Add the necessary imports at the top of the file:

```typescript
import { db } from "~/db";
import { events } from "~/db/schema";
import { eq } from "drizzle-orm";
```

- [ ] **Step 3: Update the UI to show "Save & Publish" button**

In the `EditEvent` component, detect the approved import state:

```typescript
export default function EditEvent() {
  const { event } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isRecurring = !!event.recurrenceRule;
  const isApprovedImport = event.importStatus === "approved";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to={
            event.importSourceId
              ? `/manage/import/events/${event.importSourceId}`
              : "/manage/events"
          } className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">Edit Event</h1>
          {isRecurring && (
            <Link
              to={`/manage/events/${event.id}/occurrences`}
              className="px-4 py-2 bg-harbour-100 text-harbour-700 hover:bg-harbour-200 text-sm"
            >
              Manage Occurrences
            </Link>
          )}
        </div>

        {isApprovedImport && (
          <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            This event was imported and is not yet public. Use <strong>Save &amp; Publish</strong> when ready to make it live.
          </div>
        )}

        <EventForm event={event} error={actionData?.error} />

        {isApprovedImport && (
          <Form method="post">
            <input type="hidden" name="intent" value="save-and-publish" />
            {/* Re-submit all event form fields — handled by adding a second submit button
                that wraps the EventForm, or by using a separate form that copies the data.
                Simplest approach: add the publish intent button inside EventForm via a prop. */}
            <button
              type="submit"
              name="intent"
              value="save-and-publish"
              className="w-full px-4 py-2 bg-green-600 text-white hover:bg-green-700 text-sm font-medium"
            >
              Save &amp; Publish
            </button>
          </Form>
        )}
      </div>
    </div>
  );
}
```

**Implementation note:** The cleanest approach is to pass an `extraActions` prop to `EventForm` or to add a second `<button type="submit" name="intent" value="save-and-publish">` inside the existing `EventForm` component. Look at what `EventForm` renders — it likely has its own Save button. The "Save & Publish" button needs to be inside the same `<form>` element as the rest of the event fields so all data is submitted together.

Open `app/components/EventForm.tsx`, find the submit button, and add a second button conditionally when an `onPublish` prop or `showPublish` prop is true. Pass `showPublish={isApprovedImport}` from the edit route.

- [ ] **Step 4: Verify build**

```bash
pnpm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -20
```

- [ ] **Step 5: Commit**

```bash
git add app/routes/manage/events/edit.tsx app/components/EventForm.tsx
git commit -m "feat: add Save & Publish button to event edit form for approved imports"
```

---

## Task 8: Manage UI — Source List Page

**Files:**
- Create: `app/routes/manage/import/events.tsx`
- Modify: `app/routes.ts`

- [ ] **Step 1: Register routes in `app/routes.ts`**

Find the `...prefix("import", [...])` block and add the three new event routes:

```typescript
    ...prefix("import", [
      route("technl", "routes/manage/import/technl.tsx"),
      route("genesis", "routes/manage/import/genesis.tsx"),
      route("github-by-location", "routes/manage/import/github-by-location.tsx"),
      route("github-following", "routes/manage/import/github-following.tsx"),
      route("jobs", "routes/manage/import/jobs.tsx"),
      route("jobs/importers", "routes/manage/import/jobs.importers.tsx"),
      route("jobs/new", "routes/manage/import/jobs.new.tsx"),
      route("jobs/:sourceId", "routes/manage/import/jobs.$sourceId.tsx"),
      // New event import routes:
      route("events", "routes/manage/import/events.tsx"),
      route("events/new", "routes/manage/import/events.new.tsx"),
      route("events/:sourceId", "routes/manage/import/events.$sourceId.tsx"),
    ]),
```

- [ ] **Step 2: Create `app/routes/manage/import/events.tsx`**

```tsx
import type { Route } from "./+types/events";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getAllEventImportSources,
  syncEvents,
} from "~/lib/event-importers/sync.server";
import { sourceTypeLabels } from "~/lib/event-importers/types";
import { formatDistanceToNow } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import Events - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const sources = await getAllEventImportSources();
  return { sources };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync") {
    const sourceId = Number(formData.get("sourceId"));
    if (!sourceId) return { success: false, error: "Source ID required", intent: "sync" };
    const result = await syncEvents(sourceId);
    return { intent: "sync", sourceId, ...result };
  }

  if (intent === "sync-all") {
    const sources = await getAllEventImportSources();
    let totalAdded = 0, totalSkipped = 0, totalRemoved = 0;
    const errors: string[] = [];

    for (const source of sources) {
      const result = await syncEvents(source.id);
      if (result.success) {
        totalAdded += result.added;
        totalSkipped += result.skipped;
        totalRemoved += result.removed;
      } else if (result.error) {
        errors.push(`${source.name}: ${result.error}`);
      }
    }

    return {
      intent: "sync-all",
      success: errors.length === 0,
      added: totalAdded,
      skipped: totalSkipped,
      removed: totalRemoved,
      errors,
    };
  }

  return { success: false, error: "Unknown intent" };
}

export default function ImportEvents() {
  const { sources } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const actionData = fetcher.data;
  const isLoading = fetcher.state !== "idle";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Manage
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">Event Import Sources</h1>
          <div className="flex gap-2">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="sync-all" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-harbour-600 text-white hover:bg-harbour-700 text-sm disabled:opacity-50"
              >
                {isLoading ? "Syncing..." : "Sync All"}
              </button>
            </fetcher.Form>
            <Link
              to="/manage/import/events/new"
              className="px-4 py-2 border border-harbour-200 text-harbour-700 hover:bg-harbour-50 text-sm"
            >
              Add Source
            </Link>
          </div>
        </div>

        {actionData && "added" in actionData && (
          <div className="border border-harbour-200 bg-harbour-50 p-3 text-sm text-harbour-700">
            {actionData.success
              ? `Sync complete — Added: ${actionData.added}, Skipped: ${actionData.skipped}, Removed: ${actionData.removed}`
              : `Error: ${actionData.error}`}
          </div>
        )}

        {sources.length === 0 ? (
          <div className="border border-harbour-200 p-8 text-center text-harbour-400 text-sm">
            No event import sources configured.{" "}
            <Link to="/manage/import/events/new" className="underline">
              Add one
            </Link>
            .
          </div>
        ) : (
          <div className="border border-harbour-200">
            <table className="w-full text-sm">
              <thead className="bg-harbour-50">
                <tr className="border-b border-harbour-200">
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Pending</th>
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Published</th>
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Last Fetched</th>
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {sources.map((source) => (
                  <tr key={source.id} className="hover:bg-harbour-50">
                    <td className="px-4 py-3 font-medium text-harbour-700">
                      <Link
                        to={`/manage/import/events/${source.id}`}
                        className="hover:underline"
                      >
                        {source.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-harbour-500">
                      {sourceTypeLabels[source.sourceType] ?? source.sourceType}
                    </td>
                    <td className="px-4 py-3">
                      {source.pendingCount > 0 ? (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800">
                          {source.pendingCount} pending
                        </span>
                      ) : (
                        <span className="text-harbour-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-harbour-500">{source.publishedCount}</td>
                    <td className="px-4 py-3 text-harbour-400 text-xs">
                      {source.lastFetchedAt
                        ? formatDistanceToNow(source.lastFetchedAt, { addSuffix: true })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      {source.fetchStatus === "error" ? (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700">error</span>
                      ) : source.fetchStatus === "pending" ? (
                        <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">pending</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700">ok</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="sync" />
                        <input type="hidden" name="sourceId" value={source.id} />
                        <button
                          type="submit"
                          disabled={isLoading}
                          className="text-xs px-3 py-1 border border-harbour-200 text-harbour-600 hover:bg-harbour-50 disabled:opacity-50"
                        >
                          Sync
                        </button>
                      </fetcher.Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add app/routes/manage/import/events.tsx app/routes.ts
git commit -m "feat: add event import sources list page"
```

---

## Task 9: Manage UI — Add Source Form

**Files:**
- Create: `app/routes/manage/import/events.new.tsx`

- [ ] **Step 1: Create `app/routes/manage/import/events.new.tsx`**

```tsx
import type { Route } from "./+types/events.new";
import { Link, redirect, useActionData, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllGroups } from "~/lib/groups.server";
import { createEventImportSource } from "~/lib/event-importers/sync.server";
import { getEventImporter, sourceTypeLabels } from "~/lib/event-importers/index";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Add Event Import Source - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const groups = await getAllGroups();
  return { groups };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();

  const name = (formData.get("name") as string)?.trim();
  const sourceType = formData.get("sourceType") as string;
  const sourceIdentifier = (formData.get("sourceIdentifier") as string)?.trim();
  const sourceUrl = (formData.get("sourceUrl") as string)?.trim();
  const groupIdRaw = formData.get("groupId") as string;
  const groupId = groupIdRaw ? Number(groupIdRaw) : null;

  if (!name || !sourceType || !sourceIdentifier || !sourceUrl) {
    return { error: "All fields are required." };
  }

  // Validate config via importer
  try {
    const importer = getEventImporter(sourceType);
    const validation = await importer.validateConfig({
      groupId,
      sourceType,
      sourceIdentifier,
      sourceUrl,
    });
    if (!validation.valid) {
      return { error: validation.error ?? "Source validation failed." };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error during validation." };
  }

  const source = await createEventImportSource({
    name,
    groupId,
    sourceType,
    sourceIdentifier,
    sourceUrl,
  });

  return redirect(`/manage/import/events/${source.id}`);
}

const SOURCE_TYPES = ["luma-user", "technl"] as const;

// For single-instance source types, the identifier is fixed
const FIXED_IDENTIFIERS: Record<string, string> = {
  technl: "technl",
};

export default function NewEventImportSource() {
  const { groups } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage/import/events"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Event Import Sources
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Add Event Import Source</h1>

        {actionData?.error && (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {actionData.error}
          </div>
        )}

        <form method="post" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-harbour-600" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="e.g. TechNest Community (Luma)"
              className="border border-harbour-200 px-3 py-2 text-sm text-harbour-700 focus:outline-none focus:border-harbour-400"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-harbour-600" htmlFor="sourceType">
              Source Type
            </label>
            <select
              id="sourceType"
              name="sourceType"
              className="border border-harbour-200 px-3 py-2 text-sm text-harbour-700 focus:outline-none focus:border-harbour-400"
              required
            >
              <option value="">Select a source type…</option>
              {SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {sourceTypeLabels[type] ?? type}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-harbour-600" htmlFor="sourceIdentifier">
              Source Identifier
            </label>
            <input
              id="sourceIdentifier"
              name="sourceIdentifier"
              type="text"
              placeholder="e.g. usr-bSGJmqMm6oO62Ze (for Luma user)"
              className="border border-harbour-200 px-3 py-2 text-sm text-harbour-700 focus:outline-none focus:border-harbour-400"
              required
            />
            <p className="text-xs text-harbour-400">
              For Luma users: the user ID from the profile URL (e.g. usr-xxxx). For techNL: use{" "}
              <code>technl</code>.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-harbour-600" htmlFor="sourceUrl">
              Source URL
            </label>
            <input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              placeholder="https://luma.com/user/usr-xxxx"
              className="border border-harbour-200 px-3 py-2 text-sm text-harbour-700 focus:outline-none focus:border-harbour-400"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-harbour-600" htmlFor="groupId">
              Group (optional)
            </label>
            <select
              id="groupId"
              name="groupId"
              className="border border-harbour-200 px-3 py-2 text-sm text-harbour-700 focus:outline-none focus:border-harbour-400"
            >
              <option value="">None</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-harbour-600 text-white hover:bg-harbour-700 text-sm"
            >
              Validate &amp; Save
            </button>
            <Link
              to="/manage/import/events"
              className="px-4 py-2 border border-harbour-200 text-harbour-600 hover:bg-harbour-50 text-sm"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
```

Check that `getAllGroups()` exists in `app/lib/groups.server.ts`. If the function name differs, use the correct one.

- [ ] **Step 2: Verify build**

```bash
pnpm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/manage/import/events.new.tsx
git commit -m "feat: add event import source creation form"
```

---

## Task 10: Manage UI — Source Detail + Review Workflow

**Files:**
- Create: `app/routes/manage/import/events.$sourceId.tsx`

This is the main review page with Sync Now, Pending Review, Approved (Editing), Published, Hidden, and Removed sections.

- [ ] **Step 1: Create `app/routes/manage/import/events.$sourceId.tsx`**

```tsx
import type { Route } from "./+types/events.$sourceId";
import { Link, redirect, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getEventImportSourceWithStats,
  deleteEventImportSource,
  syncEvents,
  approveImportedEvent,
  hideImportedEvent,
  unhideImportedEvent,
  downloadAndSaveCoverImage,
} from "~/lib/event-importers/sync.server";
import { sourceTypeLabels } from "~/lib/event-importers/types";
import { formatDistanceToNow, format } from "date-fns";
import { db } from "~/db";
import { events, eventDates } from "~/db/schema";
import { eq } from "drizzle-orm";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.source?.name ?? "Event Source"} - Import - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  const sourceId = Number(params.sourceId);
  if (!sourceId) throw new Response("Not Found", { status: 404 });

  const source = await getEventImportSourceWithStats(sourceId);
  if (!source) throw new Response("Not Found", { status: 404 });

  return { source };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);
  const sourceId = Number(params.sourceId);
  if (!sourceId) throw new Response("Not Found", { status: 404 });

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "sync") {
    const result = await syncEvents(sourceId);
    return { intent: "sync", ...result };
  }

  if (intent === "approve") {
    const eventId = Number(formData.get("eventId"));
    if (!eventId) return { error: "Event ID required" };

    // Download cover image if available
    const coverImageUrl = formData.get("coverImageUrl") as string | null;
    if (coverImageUrl) {
      const savedImage = await downloadAndSaveCoverImage(coverImageUrl);
      if (savedImage) {
        await db
          .update(events)
          .set({ coverImage: savedImage, updatedAt: new Date() })
          .where(eq(events.id, eventId));
      }
    }

    await approveImportedEvent(eventId);
    return redirect(`/manage/events/${eventId}`);
  }

  if (intent === "hide") {
    const eventId = Number(formData.get("eventId"));
    if (!eventId) return { error: "Event ID required" };
    await hideImportedEvent(eventId);
    return { intent: "hide", success: true };
  }

  if (intent === "unhide") {
    const eventId = Number(formData.get("eventId"));
    if (!eventId) return { error: "Event ID required" };
    await unhideImportedEvent(eventId);
    return { intent: "unhide", success: true };
  }

  if (intent === "delete-source") {
    await deleteEventImportSource(sourceId);
    return redirect("/manage/import/events");
  }

  return { error: "Unknown intent" };
}

function EventDateDisplay({ eventId }: { eventId: number }) {
  // We fetch dates in the loader via getEventImportSourceWithStats which returns
  // full event objects. Dates are in eventDates table, not on the event row itself.
  // For the review UI we just show what's on the event row (startDate from related dates).
  return null; // handled inline below
}

function formatEventDate(event: { id: number }): string {
  // Dates come back from the loader as full event objects with dates[]
  // This component is a placeholder — dates are rendered inline in the JSX below
  return "";
}

export default function EventImportSourceDetail() {
  const { source } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isLoading = fetcher.state !== "idle";
  const actionData = fetcher.data;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage/import/events"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Event Import Sources
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-harbour-700">{source.name}</h1>
            <p className="text-sm text-harbour-400 mt-1">
              {sourceTypeLabels[source.sourceType] ?? source.sourceType}
              {source.group ? ` · ${source.group.name}` : ""}
              {" · "}
              <a
                href={source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View source
              </a>
            </p>
          </div>

          <div className="flex gap-2 items-center">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="sync" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-harbour-600 text-white hover:bg-harbour-700 text-sm disabled:opacity-50"
              >
                {isLoading ? "Syncing…" : "Sync Now"}
              </button>
            </fetcher.Form>
          </div>
        </div>

        {source.fetchStatus === "error" && source.fetchError && (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Last sync error: {source.fetchError}
          </div>
        )}

        {actionData && "added" in actionData && actionData.intent === "sync" && (
          <div className="border border-harbour-200 bg-harbour-50 p-3 text-sm text-harbour-700">
            {actionData.success
              ? `Sync complete — Added: ${actionData.added}, Skipped: ${actionData.skipped}, Removed: ${actionData.removed}`
              : `Sync failed: ${actionData.error}`}
          </div>
        )}

        {/* Pending Review */}
        <section>
          <h2 className="text-lg font-semibold text-harbour-700 mb-3">
            Pending Review
            {source.pending.length > 0 && (
              <span className="ml-2 text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800">
                {source.pending.length}
              </span>
            )}
          </h2>

          {source.pending.length === 0 ? (
            <p className="text-sm text-harbour-400">No events pending review.</p>
          ) : (
            <div className="border border-harbour-200 divide-y divide-harbour-100">
              {source.pending.map((event) => (
                <div key={event.id} className="flex items-start justify-between p-4 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-harbour-700 text-sm">{event.title}</div>
                    {event.location && (
                      <div className="text-xs text-harbour-400 mt-0.5">{event.location}</div>
                    )}
                    <a
                      href={event.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-harbour-400 underline mt-0.5 inline-block"
                    >
                      View source
                    </a>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="approve" />
                      <input type="hidden" name="eventId" value={event.id} />
                      {/* Pass cover image URL for download on approve */}
                      <input type="hidden" name="coverImageUrl" value={""} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-3 py-1 bg-harbour-600 text-white hover:bg-harbour-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                    </fetcher.Form>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="hide" />
                      <input type="hidden" name="eventId" value={event.id} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-3 py-1 border border-harbour-200 text-harbour-500 hover:bg-harbour-50 disabled:opacity-50"
                      >
                        Hide
                      </button>
                    </fetcher.Form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Approved (Editing) */}
        {source.approved.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-harbour-700 mb-3">
              Approved — Editing
              <span className="ml-2 text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">
                {source.approved.length}
              </span>
            </h2>
            <div className="border border-harbour-200 divide-y divide-harbour-100">
              {source.approved.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-4">
                  <div className="font-medium text-harbour-700 text-sm">{event.title}</div>
                  <div className="flex gap-2">
                    <Link
                      to={`/manage/events/${event.id}`}
                      className="text-xs px-3 py-1 border border-harbour-200 text-harbour-600 hover:bg-harbour-50"
                    >
                      Edit & Publish
                    </Link>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="hide" />
                      <input type="hidden" name="eventId" value={event.id} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-3 py-1 border border-harbour-200 text-harbour-500 hover:bg-harbour-50"
                      >
                        Hide
                      </button>
                    </fetcher.Form>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Published */}
        {source.published.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-harbour-700 mb-3">
              Published
              <span className="ml-2 text-xs px-1.5 py-0.5 bg-green-100 text-green-700">
                {source.published.length}
              </span>
            </h2>
            <div className="border border-harbour-200 divide-y divide-harbour-100">
              {source.published.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-4">
                  <div className="font-medium text-harbour-700 text-sm">{event.title}</div>
                  <div className="flex gap-2">
                    <Link
                      to={`/manage/events/${event.id}`}
                      className="text-xs px-3 py-1 border border-harbour-200 text-harbour-600 hover:bg-harbour-50"
                    >
                      Edit
                    </Link>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="hide" />
                      <input type="hidden" name="eventId" value={event.id} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-3 py-1 border border-harbour-200 text-harbour-500 hover:bg-harbour-50"
                      >
                        Hide
                      </button>
                    </fetcher.Form>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Hidden */}
        {source.hidden.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-harbour-700 mb-3">Hidden</h2>
            <div className="border border-harbour-200 divide-y divide-harbour-100">
              {source.hidden.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-4">
                  <div className="font-medium text-harbour-700 text-sm">{event.title}</div>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="unhide" />
                    <input type="hidden" name="eventId" value={event.id} />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="text-xs px-3 py-1 border border-harbour-200 text-harbour-600 hover:bg-harbour-50"
                    >
                      Unhide
                    </button>
                  </fetcher.Form>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Removed */}
        {source.removed.length > 0 && (
          <details className="border border-harbour-200">
            <summary className="px-4 py-3 text-sm font-medium text-harbour-500 cursor-pointer hover:bg-harbour-50">
              Removed ({source.removed.length}) — no longer in source feed
            </summary>
            <div className="divide-y divide-harbour-100">
              {source.removed.map((event) => (
                <div key={event.id} className="px-4 py-3 text-sm text-harbour-400">
                  {event.title}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Danger zone */}
        <details className="border border-red-200 mt-4">
          <summary className="px-4 py-3 text-sm font-medium text-red-600 cursor-pointer hover:bg-red-50">
            Danger Zone
          </summary>
          <div className="p-4">
            <p className="text-sm text-harbour-500 mb-3">
              Deleting this source will not delete any approved or published events. Only the
              source record and pending/hidden events will be removed.
            </p>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete-source" />
              <button
                type="submit"
                className="text-xs px-3 py-1 bg-red-600 text-white hover:bg-red-700"
                onClick={(e) => {
                  if (!confirm("Delete this import source?")) e.preventDefault();
                }}
              >
                Delete Source
              </button>
            </fetcher.Form>
          </div>
        </details>
      </div>
    </div>
  );
}
```

**Note on cover images in the pending review table:** The `coverImageUrl` hidden input is empty in the template above because the full event objects from `getEventImportSourceWithStats` don't carry the raw import URL — it was never stored. Two options during implementation:

1. **Store `coverImageUrl` as a column on `events`** (simplest — add `coverImageUrl text` in migration and schema, populate it at insert time, pass it through the approve action)
2. **Skip auto-download; admin uploads manually** via the edit form after approving

Option 1 is recommended. Add `cover_image_url text` to the migration in Task 1 (or a follow-up migration), store it on insert in sync.server.ts, pass it in the hidden input, and download on approve. Update Task 1 migration and Task 3 sync code accordingly.

- [ ] **Step 2: Verify build**

```bash
pnpm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -20
```

Fix any type errors. Common issues:
- `event.importStatus` may be typed as `string | null` — add null checks
- `source.pending` etc. are arrays of the full Drizzle event type — check that `event.title`, `event.link`, `event.location`, `event.id` exist on that type (they do per schema)

- [ ] **Step 3: Commit**

```bash
git add app/routes/manage/import/events.$sourceId.tsx
git commit -m "feat: add event import source detail and review workflow page"
```

---

## Task 11: Cover Image URL Column (Recommended follow-up to Task 10)

**Files:**
- Create: `drizzle/0040_add_events_cover_image_url.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `app/db/schema.ts`
- Modify: `app/lib/event-importers/sync.server.ts`

This stores the scraped cover image URL so it can be downloaded when the admin approves the event.

- [ ] **Step 1: Create migration**

`drizzle/0040_add_events_cover_image_url.sql`:

```sql
ALTER TABLE `events` ADD `cover_image_url` text;
```

- [ ] **Step 2: Add journal entry**

```json
{
  "idx": 40,
  "version": "6",
  "when": 1743523300000,
  "tag": "0040_add_events_cover_image_url",
  "breakpoints": true
}
```

- [ ] **Step 3: Run migration**

```bash
pnpm run db:migrate
```

- [ ] **Step 4: Add `coverImageUrl` to `events` table in schema.ts**

In the `events` table definition, add after `lastSeenAt`:

```typescript
  coverImageUrl: text("cover_image_url"),
```

- [ ] **Step 5: Store it on insert in sync.server.ts**

In `insertImportedEvent()`, add to the `.values({...})` call:

```typescript
  coverImageUrl: fetched.coverImageUrl,
```

- [ ] **Step 6: Pass it in the approve form in events.$sourceId.tsx**

In the Pending Review section, update the hidden input:

```tsx
<input type="hidden" name="coverImageUrl" value={event.coverImageUrl ?? ""} />
```

- [ ] **Step 7: Verify build and commit**

```bash
pnpm run build 2>&1 | grep -E "error" | grep -v "node_modules" | head -20
git add drizzle/0040_add_events_cover_image_url.sql drizzle/meta/_journal.json app/db/schema.ts app/lib/event-importers/sync.server.ts app/routes/manage/import/events.$sourceId.tsx
git commit -m "feat: store scraped cover image URL for download on event approve"
```

---

## Task 12: Quality Gates and Final Verification

- [ ] **Step 1: Run lint fix**

```bash
pnpm run lint:fix
```

Fix any lint errors reported.

- [ ] **Step 2: Run full build**

```bash
pnpm run build
```

Expected: zero errors. Fix any TypeScript errors before proceeding.

- [ ] **Step 3: Smoke test the full flow manually**

Start the dev server:

```bash
pnpm dev
```

1. Navigate to `/manage/import/events` — should show empty source list with "Add Source" button
2. Click "Add Source" → fill in a techNL source (sourceType: `technl`, identifier: `technl`, url: `https://technl.ca/news-events/`) → "Validate & Save"
3. Should redirect to source detail page
4. Click "Sync Now" — should fetch events from techNL and show them in Pending Review
5. Approve one event — should redirect to `/manage/events/:id` edit form with amber notice banner
6. Check that the event is NOT visible on the public `/events` page yet
7. Click "Save & Publish" — should redirect back to the source detail page, event moves to Published section
8. Verify the event now appears on the public `/events` page

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: event import sources — luma and techNL scrapers with review/publish workflow"
```
