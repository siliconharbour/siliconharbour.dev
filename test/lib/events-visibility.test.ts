import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { events, eventDates, references } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getPublicEventBySlug,
  getEventById,
  getEventBySlug,
  createEvent,
} from "~/lib/events.server";

// =============================================================================
// getPublicEventBySlug — visibility filtering
// =============================================================================

describe("getPublicEventBySlug", () => {
  it("returns a normal event (no import status)", async () => {
    await db.insert(events).values({
      slug: "local-meetup",
      title: "Local Meetup",
      description: "A local event",
      link: "https://example.com",
    });
    // Also add a date so the event is complete
    const evt = await db
      .select()
      .from(events)
      .where(eq(events.slug, "local-meetup"))
      .get();
    await db.insert(eventDates).values({
      eventId: evt!.id,
      startDate: new Date("2025-06-01T18:00:00Z"),
    });

    const result = await getPublicEventBySlug("local-meetup");
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("local-meetup");
    expect(result!.title).toBe("Local Meetup");
    expect(result!.importStatus).toBeNull();
  });

  it("returns a published imported event", async () => {
    await db.insert(events).values({
      slug: "published-import",
      title: "Published Import",
      description: "Imported and published",
      link: "https://example.com",
      importStatus: "published",
    });

    const result = await getPublicEventBySlug("published-import");
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Published Import");
  });

  it("returns null for hidden imported event", async () => {
    await db.insert(events).values({
      slug: "hidden-import",
      title: "Hidden Import",
      description: "Imported but hidden",
      link: "https://example.com",
      importStatus: "hidden",
    });

    const result = await getPublicEventBySlug("hidden-import");
    expect(result).toBeNull();
  });

  it("returns null for pending_review imported event", async () => {
    await db.insert(events).values({
      slug: "pending-import",
      title: "Pending Import",
      description: "Awaiting review",
      link: "https://example.com",
      importStatus: "pending_review",
    });

    const result = await getPublicEventBySlug("pending-import");
    expect(result).toBeNull();
  });

  it("returns null for non-existent slug", async () => {
    const result = await getPublicEventBySlug("does-not-exist");
    expect(result).toBeNull();
  });
});

// =============================================================================
// createEvent — slug generation and reference syncing
// =============================================================================

describe("createEvent", () => {
  it("creates an event with dates and generates a correct slug", async () => {
    const result = await createEvent(
      {
        title: "My Test Event",
        description: "Event description",
        link: "https://example.com/event",
        organizer: null,
      },
      [
        {
          startDate: new Date("2025-07-01T18:00:00Z"),
          endDate: new Date("2025-07-01T20:00:00Z"),
        },
      ],
    );

    expect(result.id).toBeDefined();
    expect(result.slug).toBe("my-test-event");
    expect(result.title).toBe("My Test Event");
    expect(result.dates).toHaveLength(1);
    expect(result.dates[0].eventId).toBe(result.id);
    expect(result.dates[0].startDate).toEqual(new Date("2025-07-01T18:00:00Z"));
    expect(result.dates[0].endDate).toEqual(new Date("2025-07-01T20:00:00Z"));

    // Verify DB directly
    const dbEvent = await getEventById(result.id);
    expect(dbEvent).not.toBeNull();
    expect(dbEvent!.slug).toBe("my-test-event");
    expect(dbEvent!.dates).toHaveLength(1);
  });

  it("syncs organizer references on creation", async () => {
    // Seed a group that the organizer can reference
    const { groups } = await import("~/db/schema");
    const [group] = await db
      .insert(groups)
      .values({
        slug: "devnl",
        name: "DevNL",
        description: "Newfoundland developer community",
      })
      .returning();

    const result = await createEvent(
      {
        title: "DevNL Meetup",
        description: "Monthly meetup organized by DevNL",
        link: "https://devnl.ca",
        organizer: "DevNL",
      },
      [{ startDate: new Date("2025-08-01T18:00:00Z") }],
    );

    // Should have created an organizer reference from event -> group
    const refs = await db
      .select()
      .from(references)
      .where(
        and(
          eq(references.sourceType, "event"),
          eq(references.sourceId, result.id),
          eq(references.field, "organizer"),
        ),
      );

    expect(refs).toHaveLength(1);
    expect(refs[0].targetType).toBe("group");
    expect(refs[0].targetId).toBe(group.id);
    expect(refs[0].referenceText).toBe("DevNL");
    expect(refs[0].relation).toBe("Organizer");
  });
});

// =============================================================================
// getEventById / getEventBySlug — basic fetch
// =============================================================================

describe("getEventById / getEventBySlug", () => {
  it("getEventById returns event with dates", async () => {
    const [evt] = await db
      .insert(events)
      .values({
        slug: "fetch-test",
        title: "Fetch Test",
        description: "Testing getEventById",
        link: "https://example.com",
      })
      .returning();
    await db.insert(eventDates).values({
      eventId: evt.id,
      startDate: new Date("2025-09-01T18:00:00Z"),
    });

    const result = await getEventById(evt.id);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Fetch Test");
    expect(result!.dates).toHaveLength(1);
  });

  it("getEventBySlug returns event with dates", async () => {
    const [evt] = await db
      .insert(events)
      .values({
        slug: "slug-test",
        title: "Slug Test",
        description: "Testing getEventBySlug",
        link: "https://example.com",
      })
      .returning();
    await db.insert(eventDates).values({
      eventId: evt.id,
      startDate: new Date("2025-09-15T18:00:00Z"),
    });

    const result = await getEventBySlug("slug-test");
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Slug Test");
    expect(result!.dates).toHaveLength(1);
  });

  it("getEventById returns null for non-existent ID", async () => {
    const result = await getEventById(99999);
    expect(result).toBeNull();
  });

  it("getEventBySlug returns null for non-existent slug", async () => {
    const result = await getEventBySlug("nonexistent");
    expect(result).toBeNull();
  });
});
