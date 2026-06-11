/**
 * Core CRUD + lookup coverage for app/lib/events.server.ts.
 *
 * Baseline (s-fa1b): 13.0% lines, 10.4% functions covered.
 * Targets the load-bearing path used by the manage UI, the MCP
 * createEntity({ type:'event' }) dispatch, and the public event detail
 * page. Recurrence/occurrence orchestration is deliberately out of
 * scope here — separate concern, separate ticket if/when needed.
 */

import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { eventDates } from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEventById,
  getEventBySlug,
  getPublicEventBySlug,
  getAllEvents,
  getUpcomingEvents,
  generateEventSlug,
  type EventWithDates,
} from "~/lib/events.server";
import type { NewEvent } from "~/db/schema";

// =============================================================================
// Helpers
// =============================================================================

function baseEvent(overrides: Partial<Omit<NewEvent, "slug">> = {}): Omit<NewEvent, "slug"> {
  return {
    title: "Test Event",
    description: "Plain test description with no references",
    link: "https://example.com/event",
    location: null,
    organizer: null,
    coverImage: null,
    iconImage: null,
    coverImageUrl: null,
    ...overrides,
  };
}

function dateAt(daysFromNow: number, hour = 18): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

// =============================================================================
// generateEventSlug — uniqueness handling
// =============================================================================

describe("generateEventSlug", () => {
  it("returns the slugified title when no collision exists", async () => {
    const slug = await generateEventSlug("Build48 Hackathon");
    expect(slug).toBe("build48-hackathon");
  });

  it("appends -2 when the same title already exists", async () => {
    await createEvent(baseEvent({ title: "Coffee Meetup" }), [
      { startDate: dateAt(1), endDate: null },
    ]);

    const slug = await generateEventSlug("Coffee Meetup");
    expect(slug).toBe("coffee-meetup-2");
  });

  it("walks through -2, -3 when multiple collisions exist", async () => {
    await createEvent(baseEvent({ title: "Demo Night" }), [{ startDate: dateAt(1), endDate: null }]);
    await createEvent(baseEvent({ title: "Demo Night" }), [{ startDate: dateAt(2), endDate: null }]);

    const slug = await generateEventSlug("Demo Night");
    expect(slug).toBe("demo-night-3");
  });

  it("does not consider the excludeId's own slug as a collision", async () => {
    // This is the rename case: when an event is being renamed, its own
    // existing slug should not block reusing the same base slug.
    const created = await createEvent(baseEvent({ title: "Original Title" }), [
      { startDate: dateAt(1), endDate: null },
    ]);

    const slug = await generateEventSlug("Original Title", created.id);
    expect(slug).toBe("original-title");
  });
});

// =============================================================================
// createEvent
// =============================================================================

describe("createEvent", () => {
  it("persists the event with a generated slug and the supplied dates", async () => {
    const created = await createEvent(
      baseEvent({ title: "Software Meetup", description: "Monthly meetup" }),
      [{ startDate: dateAt(7), endDate: null }],
    );

    expect(created.id).toBeGreaterThan(0);
    expect(created.slug).toBe("software-meetup");
    expect(created.title).toBe("Software Meetup");
    expect(created.dates).toHaveLength(1);
    expect(created.dates[0].eventId).toBe(created.id);
  });

  it("inserts multiple dates when supplied", async () => {
    const created = await createEvent(baseEvent(), [
      { startDate: dateAt(1), endDate: null },
      { startDate: dateAt(8), endDate: null },
      { startDate: dateAt(15), endDate: null },
    ]);

    expect(created.dates).toHaveLength(3);
    const stored = await db
      .select()
      .from(eventDates)
      .where(eq(eventDates.eventId, created.id));
    expect(stored).toHaveLength(3);
  });

  it("allows zero dates (used for recurring events with no explicit instances)", async () => {
    const created = await createEvent(baseEvent({ title: "Recurring Series" }), []);
    expect(created.dates).toHaveLength(0);
  });
});

// =============================================================================
// updateEvent
// =============================================================================

describe("updateEvent", () => {
  it("patches a single field and bumps updatedAt", async () => {
    const created = await createEvent(baseEvent(), [{ startDate: dateAt(1), endDate: null }]);
    const originalUpdatedAt = created.updatedAt;

    // Force a measurable updatedAt delta — drizzle's timestamps are
    // second-resolution in sqlite so we wait briefly.
    await new Promise((r) => setTimeout(r, 1100));

    const updated = await updateEvent(created.id, { location: "St. John's, NL" });
    expect(updated).not.toBeNull();
    expect(updated!.location).toBe("St. John's, NL");
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it("regenerates the slug when the title changes", async () => {
    const created = await createEvent(baseEvent({ title: "Old Title" }), [
      { startDate: dateAt(1), endDate: null },
    ]);
    expect(created.slug).toBe("old-title");

    const updated = await updateEvent(created.id, { title: "Brand New Title" });
    expect(updated!.slug).toBe("brand-new-title");
  });

  it("returns null when the target id does not exist", async () => {
    const updated = await updateEvent(999_999, { location: "noop" });
    expect(updated).toBeNull();
  });

  it("replaces the dates array when a new dates array is supplied", async () => {
    const created = await createEvent(baseEvent(), [
      { startDate: dateAt(1), endDate: null },
      { startDate: dateAt(8), endDate: null },
    ]);

    const updated = await updateEvent(created.id, {}, [
      { startDate: dateAt(20), endDate: null },
    ]);
    expect(updated!.dates).toHaveLength(1);
    expect(updated!.dates[0].startDate.getTime()).toBeCloseTo(dateAt(20).getTime(), -3);

    // The old dates should be gone — not just orphaned.
    const stored = await db
      .select()
      .from(eventDates)
      .where(eq(eventDates.eventId, created.id));
    expect(stored).toHaveLength(1);
  });

  it("preserves existing dates when no dates argument is supplied", async () => {
    const created = await createEvent(baseEvent(), [
      { startDate: dateAt(1), endDate: null },
      { startDate: dateAt(8), endDate: null },
    ]);

    const updated = await updateEvent(created.id, { location: "venue change" });
    expect(updated!.dates).toHaveLength(2);
  });
});

// =============================================================================
// deleteEvent
// =============================================================================

describe("deleteEvent", () => {
  it("removes the event and reports true on success", async () => {
    const created = await createEvent(baseEvent(), [{ startDate: dateAt(1), endDate: null }]);

    const deleted = await deleteEvent(created.id);
    expect(deleted).toBe(true);

    const after = await getEventById(created.id);
    expect(after).toBeNull();
  });

  it("returns false when the event does not exist", async () => {
    const deleted = await deleteEvent(999_999);
    expect(deleted).toBe(false);
  });

  it("cascade-deletes the event's dates row", async () => {
    const created = await createEvent(baseEvent(), [
      { startDate: dateAt(1), endDate: null },
      { startDate: dateAt(2), endDate: null },
    ]);

    await deleteEvent(created.id);

    const orphaned = await db
      .select()
      .from(eventDates)
      .where(eq(eventDates.eventId, created.id));
    expect(orphaned).toHaveLength(0);
  });
});

// =============================================================================
// Lookups
// =============================================================================

describe("getEventById / getEventBySlug", () => {
  it("returns the event with its dates attached, sorted by startDate", async () => {
    const created = await createEvent(baseEvent({ title: "Sorting Test" }), [
      { startDate: dateAt(10), endDate: null },
      { startDate: dateAt(1), endDate: null }, // earlier date inserted second
      { startDate: dateAt(5), endDate: null },
    ]);

    const fetched = await getEventById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.dates).toHaveLength(3);
    // Dates should come back ordered ascending by startDate.
    for (let i = 1; i < fetched!.dates.length; i++) {
      expect(
        fetched!.dates[i].startDate.getTime() >= fetched!.dates[i - 1].startDate.getTime(),
      ).toBe(true);
    }
  });

  it("returns null when the id is not found", async () => {
    expect(await getEventById(999_999)).toBeNull();
  });

  it("getEventBySlug round-trips with createEvent's generated slug", async () => {
    const created = await createEvent(baseEvent({ title: "Slug Lookup Test" }), [
      { startDate: dateAt(1), endDate: null },
    ]);
    const fetched = await getEventBySlug(created.slug);
    expect(fetched!.id).toBe(created.id);
  });
});

describe("getPublicEventBySlug", () => {
  it("returns events with importStatus IS NULL (manual events)", async () => {
    const created = await createEvent(baseEvent({ title: "Manual Public" }), [
      { startDate: dateAt(1), endDate: null },
    ]);
    // baseEvent doesn't set importStatus, so it's null — visible.
    const fetched = await getPublicEventBySlug(created.slug);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it("returns events with importStatus = 'published'", async () => {
    const created = await createEvent(
      baseEvent({ title: "Published Import", importStatus: "published" }),
      [{ startDate: dateAt(1), endDate: null }],
    );
    expect((await getPublicEventBySlug(created.slug))?.id).toBe(created.id);
  });

  it("hides events with importStatus = 'pending_review' (the createEntity default)", async () => {
    const created = await createEvent(
      baseEvent({ title: "Pending Event", importStatus: "pending_review" }),
      [{ startDate: dateAt(1), endDate: null }],
    );
    expect(await getPublicEventBySlug(created.slug)).toBeNull();
  });

  it("hides events with importStatus = 'hidden'", async () => {
    const created = await createEvent(
      baseEvent({ title: "Hidden Event", importStatus: "hidden" }),
      [{ startDate: dateAt(1), endDate: null }],
    );
    expect(await getPublicEventBySlug(created.slug)).toBeNull();
  });

  it("returns null for unknown slug", async () => {
    expect(await getPublicEventBySlug("no-such-slug")).toBeNull();
  });
});

describe("getAllEvents / getUpcomingEvents", () => {
  it("getAllEvents returns events in createdAt descending order", async () => {
    const first = await createEvent(baseEvent({ title: "Older" }), [
      { startDate: dateAt(1), endDate: null },
    ]);
    await new Promise((r) => setTimeout(r, 1100));
    const second = await createEvent(baseEvent({ title: "Newer" }), [
      { startDate: dateAt(1), endDate: null },
    ]);

    const all = await getAllEvents();
    const titles = all.map((e) => e.title);
    expect(titles.indexOf("Newer")).toBeLessThan(titles.indexOf("Older"));
    expect(all.some((e) => e.id === first.id)).toBe(true);
    expect(all.some((e) => e.id === second.id)).toBe(true);
  });

  it("getUpcomingEvents excludes events whose dates are fully past", async () => {
    const past = await createEvent(baseEvent({ title: "Past Event" }), [
      { startDate: dateAt(-30), endDate: dateAt(-29) },
    ]);
    const future = await createEvent(baseEvent({ title: "Future Event" }), [
      { startDate: dateAt(7), endDate: null },
    ]);

    const upcoming = await getUpcomingEvents();
    const ids = upcoming.map((e) => e.id);
    expect(ids).not.toContain(past.id);
    expect(ids).toContain(future.id);
  });

  it("getUpcomingEvents includes events already started but not yet ended", async () => {
    // In-progress: started yesterday, ends tomorrow.
    const ongoing = await createEvent(baseEvent({ title: "Ongoing Event" }), [
      { startDate: dateAt(-1), endDate: dateAt(1) },
    ]);
    const upcoming = await getUpcomingEvents();
    expect(upcoming.some((e) => e.id === ongoing.id)).toBe(true);
  });
});

// =============================================================================
// Type plumbing check — keep EventWithDates in scope
// =============================================================================

describe("type plumbing", () => {
  it("EventWithDates is what create/get return at the type level", async () => {
    const created: EventWithDates = await createEvent(baseEvent(), [
      { startDate: dateAt(1), endDate: null },
    ]);
    expect(created.dates).toBeDefined();
  });
});
