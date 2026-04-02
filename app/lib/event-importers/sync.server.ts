/**
 * Event Import Sync Logic
 * Handles the sync algorithm for importing events from external sources.
 * Mirrors app/lib/job-importers/sync.server.ts in structure.
 */

import { db } from "~/db";
import { eventImportSources, events, eventDates, groups } from "~/db/schema";
import type { EventSourceType } from "~/db/schema";
import { eq, and, inArray } from "drizzle-orm";
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

export async function validateEventImportSourceConfig(config: {
  groupId: number | null;
  sourceType: string;
  sourceIdentifier: string;
  sourceUrl: string;
}): Promise<{ valid: boolean; error?: string }> {
  const importer = getEventImporter(config.sourceType);
  return importer.validateConfig(config);
}

export async function createEventImportSource(data: {
  name: string;
  groupId: number | null;
  sourceType: string;
  sourceIdentifier: string;
  sourceUrl: string;
}) {
  const [source] = await db
    .insert(eventImportSources)
    .values({
      name: data.name,
      groupId: data.groupId,
      sourceType: data.sourceType as EventSourceType,
      sourceIdentifier: data.sourceIdentifier,
      sourceUrl: data.sourceUrl,
    })
    .returning();
  return source;
}

export async function deleteEventImportSource(sourceId: number) {
  // Delete pending/hidden/removed events — they were never published, not worth keeping
  const eventsToDelete = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.importSourceId, sourceId),
        inArray(events.importStatus, ["pending_review", "hidden", "removed"]),
      ),
    );

  for (const event of eventsToDelete) {
    // Delete event_dates first (no cascade in SQLite without FK pragma)
    await db.delete(eventDates).where(eq(eventDates.eventId, event.id));
    await db.delete(events).where(eq(events.id, event.id));
  }

  // Detach approved/published events — keep them but remove the source link
  await db
    .update(events)
    .set({ importSourceId: null, updatedAt: new Date() })
    .where(eq(events.importSourceId, sourceId));

  // Delete the source
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
  _groupId: number | null,
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
      coverImageUrl: fetched.coverImageUrl,
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

      if (!existing || existing.importStatus === "removed") {
        // New or re-appeared event — insert or re-insert as pending_review
        if (!existing) {
          await insertImportedEvent(sourceId, source.groupId, fetched);
          results.added++;
        } else {
          // Re-appeared: reset to pending_review and refresh fields
          await refreshPendingEvent(existing.id, fetched);
          await db
            .update(events)
            .set({ importStatus: "pending_review", updatedAt: new Date() })
            .where(eq(events.id, existing.id));
          results.added++;
        }
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
