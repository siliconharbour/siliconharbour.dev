import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { events, eventDates, eventImportSources } from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  approveImportedEvent,
  publishImportedEvent,
  hideImportedEvent,
  unhideImportedEvent,
  deleteEventImportSource,
  createEventImportSource,
} from "~/lib/event-importers/sync.server";

// =============================================================================
// Helpers
// =============================================================================

/** Create an event import source and return its id */
async function seedSource(overrides?: Partial<Parameters<typeof createEventImportSource>[0]>) {
  const source = await createEventImportSource({
    name: "Test Source",
    organizer: "Test Org",
    sourceType: "luma-user",
    sourceIdentifier: "test-id",
    sourceUrl: "https://example.com",
    ...overrides,
  });
  return source;
}

/** Insert a minimal imported event linked to a source */
async function seedEvent(
  sourceId: number,
  importStatus: string,
  externalId?: string,
) {
  const now = new Date();
  const slug = `test-event-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const [event] = await db
    .insert(events)
    .values({
      slug,
      title: "Test Event",
      description: "Test description",
      link: "https://example.com/event",
      organizer: "Test Org",
      importSourceId: sourceId,
      externalId: externalId ?? `ext-${slug}`,
      importStatus,
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Also insert an event_dates row so deletion tests cover that table
  await db.insert(eventDates).values({
    eventId: event.id,
    startDate: now,
  });

  return event;
}

// =============================================================================
// Status transitions
// =============================================================================

describe("approveImportedEvent", () => {
  it("sets importStatus to approved", async () => {
    const source = await seedSource();
    const event = await seedEvent(source.id, "pending_review");

    await approveImportedEvent(event.id);

    const [updated] = await db
      .select()
      .from(events)
      .where(eq(events.id, event.id));
    expect(updated.importStatus).toBe("approved");
  });
});

describe("publishImportedEvent", () => {
  it("sets importStatus to published", async () => {
    const source = await seedSource();
    const event = await seedEvent(source.id, "approved");

    await publishImportedEvent(event.id);

    const [updated] = await db
      .select()
      .from(events)
      .where(eq(events.id, event.id));
    expect(updated.importStatus).toBe("published");
  });
});

describe("hideImportedEvent", () => {
  it("sets importStatus to hidden", async () => {
    const source = await seedSource();
    const event = await seedEvent(source.id, "pending_review");

    await hideImportedEvent(event.id);

    const [updated] = await db
      .select()
      .from(events)
      .where(eq(events.id, event.id));
    expect(updated.importStatus).toBe("hidden");
  });
});

describe("unhideImportedEvent", () => {
  it("sets importStatus back to pending_review", async () => {
    const source = await seedSource();
    const event = await seedEvent(source.id, "hidden");

    await unhideImportedEvent(event.id);

    const [updated] = await db
      .select()
      .from(events)
      .where(eq(events.id, event.id));
    expect(updated.importStatus).toBe("pending_review");
  });
});

// =============================================================================
// deleteEventImportSource
// =============================================================================

describe("deleteEventImportSource", () => {
  it("deletes the source record", async () => {
    const source = await seedSource();

    await deleteEventImportSource(source.id);

    const rows = await db
      .select()
      .from(eventImportSources)
      .where(eq(eventImportSources.id, source.id));
    expect(rows).toHaveLength(0);
  });

  it("deletes pending events linked to the source", async () => {
    const source = await seedSource();
    const pending = await seedEvent(source.id, "pending_review");

    await deleteEventImportSource(source.id);

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.id, pending.id));
    expect(rows).toHaveLength(0);
  });

  it("deletes hidden events linked to the source", async () => {
    const source = await seedSource();
    const hidden = await seedEvent(source.id, "hidden");

    await deleteEventImportSource(source.id);

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.id, hidden.id));
    expect(rows).toHaveLength(0);
  });

  it("deletes removed events linked to the source", async () => {
    const source = await seedSource();
    const removed = await seedEvent(source.id, "removed");

    await deleteEventImportSource(source.id);

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.id, removed.id));
    expect(rows).toHaveLength(0);
  });

  it("deletes event_dates for deleted events", async () => {
    const source = await seedSource();
    const pending = await seedEvent(source.id, "pending_review");

    // Verify date row exists before deletion
    const datesBefore = await db
      .select()
      .from(eventDates)
      .where(eq(eventDates.eventId, pending.id));
    expect(datesBefore).toHaveLength(1);

    await deleteEventImportSource(source.id);

    const datesAfter = await db
      .select()
      .from(eventDates)
      .where(eq(eventDates.eventId, pending.id));
    expect(datesAfter).toHaveLength(0);
  });

  it("detaches approved events (sets importSourceId to null)", async () => {
    const source = await seedSource();
    const approved = await seedEvent(source.id, "approved");

    await deleteEventImportSource(source.id);

    const [updated] = await db
      .select()
      .from(events)
      .where(eq(events.id, approved.id));
    expect(updated).toBeDefined();
    expect(updated.importSourceId).toBeNull();
  });

  it("detaches published events (sets importSourceId to null)", async () => {
    const source = await seedSource();
    const published = await seedEvent(source.id, "published");

    await deleteEventImportSource(source.id);

    const [updated] = await db
      .select()
      .from(events)
      .where(eq(events.id, published.id));
    expect(updated).toBeDefined();
    expect(updated.importSourceId).toBeNull();
  });

  it("handles mixed statuses correctly in one operation", async () => {
    const source = await seedSource();
    const pending = await seedEvent(source.id, "pending_review", "ext-1");
    const hidden = await seedEvent(source.id, "hidden", "ext-2");
    const approved = await seedEvent(source.id, "approved", "ext-3");
    const published = await seedEvent(source.id, "published", "ext-4");

    await deleteEventImportSource(source.id);

    // pending and hidden should be deleted
    const pendingRows = await db.select().from(events).where(eq(events.id, pending.id));
    const hiddenRows = await db.select().from(events).where(eq(events.id, hidden.id));
    expect(pendingRows).toHaveLength(0);
    expect(hiddenRows).toHaveLength(0);

    // approved and published should be detached (still exist, source nulled)
    const [approvedRow] = await db.select().from(events).where(eq(events.id, approved.id));
    const [publishedRow] = await db.select().from(events).where(eq(events.id, published.id));
    expect(approvedRow.importSourceId).toBeNull();
    expect(publishedRow.importSourceId).toBeNull();

    // source itself deleted
    const sourceRows = await db
      .select()
      .from(eventImportSources)
      .where(eq(eventImportSources.id, source.id));
    expect(sourceRows).toHaveLength(0);
  });
});
