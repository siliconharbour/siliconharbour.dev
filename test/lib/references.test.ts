import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { events, groups, companies, references } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import {
  resolveReference,
  syncOrganizerReferences,
} from "~/lib/references.server";

// =============================================================================
// resolveReference
// =============================================================================

describe("resolveReference", () => {
  it("resolves a group by exact name match", async () => {
    await db.insert(groups).values({
      slug: "devnl",
      name: "DevNL",
      description: "Newfoundland developer community",
    });

    const result = await resolveReference("DevNL");

    expect(result.resolved).toBe(true);
    expect(result.reference).toMatchObject({
      text: "DevNL",
      type: "group",
      name: "DevNL",
      slug: "devnl",
    });
  });

  it("resolves a company by exact name match", async () => {
    await db.insert(companies).values({
      slug: "verafin",
      name: "Verafin",
      description: "Financial crime detection",
    });

    const result = await resolveReference("Verafin");

    expect(result.resolved).toBe(true);
    expect(result.reference).toMatchObject({
      text: "Verafin",
      type: "company",
      name: "Verafin",
      slug: "verafin",
    });
  });

  it("resolves an event by exact title match", async () => {
    await db.insert(events).values({
      slug: "tech-meetup-jan",
      title: "Tech Meetup January",
      description: "Monthly meetup",
      link: "https://example.com/meetup",
    });

    const result = await resolveReference("Tech Meetup January");

    expect(result.resolved).toBe(true);
    expect(result.reference).toMatchObject({
      text: "Tech Meetup January",
      type: "event",
      name: "Tech Meetup January",
      slug: "tech-meetup-jan",
    });
  });

  it("returns not_found for unknown names", async () => {
    const result = await resolveReference("Nonexistent Entity");

    expect(result.resolved).toBe(false);
    expect(result.reference).toMatchObject({
      text: "Nonexistent Entity",
      reason: "not_found",
    });
  });

  it("excludes hidden imported events from candidates", async () => {
    // A hidden imported event should NOT be found
    await db.insert(events).values({
      slug: "hidden-import-1",
      title: "10am @ MUN",
      description: "",
      link: "https://example.com/1",
      importStatus: "hidden",
      importSourceId: null,
    });

    const result = await resolveReference("10am @ MUN");

    expect(result.resolved).toBe(false);
    expect(result.reference).toMatchObject({
      text: "10am @ MUN",
      reason: "not_found",
    });
  });

  it("excludes pending_review imported events from candidates", async () => {
    await db.insert(events).values({
      slug: "pending-import-1",
      title: "Weekly Standup",
      description: "",
      link: "https://example.com/2",
      importStatus: "pending_review",
      importSourceId: null,
    });

    const result = await resolveReference("Weekly Standup");

    expect(result.resolved).toBe(false);
    expect(result.reference).toMatchObject({
      text: "Weekly Standup",
      reason: "not_found",
    });
  });

  it("includes published imported events as candidates", async () => {
    await db.insert(events).values({
      slug: "published-import-1",
      title: "Published Import Event",
      description: "",
      link: "https://example.com/3",
      importStatus: "published",
      importSourceId: null,
    });

    const result = await resolveReference("Published Import Event");

    expect(result.resolved).toBe(true);
    expect(result.reference).toMatchObject({
      text: "Published Import Event",
      type: "event",
      name: "Published Import Event",
    });
  });

  it("prefers group over event when both share the same name", async () => {
    // Group named "MUN Computer Science Society"
    await db.insert(groups).values({
      slug: "mun-cs",
      name: "MUN Computer Science Society",
      description: "CS group at MUN",
    });

    // Event with same title (e.g., the group's recurring meetup)
    await db.insert(events).values({
      slug: "mun-cs-meetup",
      title: "MUN Computer Science Society",
      description: "Weekly meetup",
      link: "https://example.com/mun-cs",
      organizer: "MUN Computer Science Society",
    });

    const result = await resolveReference("MUN Computer Science Society");

    // Should prefer group (non-event) over event
    expect(result.resolved).toBe(true);
    expect(result.reference).toMatchObject({
      text: "MUN Computer Science Society",
      type: "group",
      name: "MUN Computer Science Society",
      slug: "mun-cs",
    });
  });

  it("full production scenario: group + real event + many hidden imports -> resolves to group", async () => {
    // The real-world bug: a group called "10am @ MUN" has a real published event
    // plus dozens of hidden imported events with the same title. Before the fix,
    // the many event candidates made resolution "ambiguous".

    // 1. The group
    await db.insert(groups).values({
      slug: "10am-at-mun",
      name: "10am @ MUN",
      description: "Weekly talk series at MUN",
    });

    // 2. One published event with the group's name as title
    await db.insert(events).values({
      slug: "10am-at-mun-jan",
      title: "10am @ MUN",
      description: "January session",
      link: "https://example.com/jan",
      organizer: "10am @ MUN",
      importStatus: "published",
    });

    // 3. Many hidden imported events with the same title
    for (let i = 1; i <= 20; i++) {
      await db.insert(events).values({
        slug: `10am-at-mun-hidden-${i}`,
        title: "10am @ MUN",
        description: "",
        link: `https://example.com/hidden/${i}`,
        importStatus: "hidden",
      });
    }

    const result = await resolveReference("10am @ MUN");

    // Hidden events excluded -> candidates are 1 group + 1 published event
    // Dedup keeps 1 event -> 2 types (group + event)
    // Non-event preference picks the group
    expect(result.resolved).toBe(true);
    expect(result.reference).toMatchObject({
      text: "10am @ MUN",
      type: "group",
      name: "10am @ MUN",
      slug: "10am-at-mun",
    });
  });
});

// =============================================================================
// syncOrganizerReferences
// =============================================================================

describe("syncOrganizerReferences", () => {
  it("creates reference from event to group when organizer matches", async () => {
    // Seed a group
    const [group] = await db
      .insert(groups)
      .values({
        slug: "devnl",
        name: "DevNL",
        description: "Dev community",
      })
      .returning();

    // Seed an event
    const [event] = await db
      .insert(events)
      .values({
        slug: "devnl-meetup",
        title: "DevNL Monthly Meetup",
        description: "Come join us",
        link: "https://devnl.ca",
        organizer: "DevNL",
      })
      .returning();

    const result = await syncOrganizerReferences(event.id, "DevNL");

    // Check return value
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]).toMatchObject({
      type: "group",
      name: "DevNL",
    });
    expect(result.unresolved).toHaveLength(0);

    // Verify actual DB row
    const refs = await db
      .select()
      .from(references)
      .where(
        and(
          eq(references.sourceType, "event"),
          eq(references.sourceId, event.id),
        ),
      );

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      sourceType: "event",
      sourceId: event.id,
      targetType: "group",
      targetId: group.id,
      referenceText: "DevNL",
      relation: "Organizer",
      field: "organizer",
    });
  });

  it("resolves multiple comma-separated organizers (group + company)", async () => {
    await db.insert(groups).values({
      slug: "devnl",
      name: "DevNL",
      description: "",
    });

    await db.insert(companies).values({
      slug: "colab",
      name: "CoLab Software",
      description: "",
    });

    const [event] = await db
      .insert(events)
      .values({
        slug: "joint-meetup",
        title: "Joint Meetup",
        description: "",
        link: "https://example.com",
        organizer: "DevNL, CoLab Software",
      })
      .returning();

    const result = await syncOrganizerReferences(
      event.id,
      "DevNL, CoLab Software",
    );

    expect(result.resolved).toHaveLength(2);
    expect(result.unresolved).toHaveLength(0);

    const types = result.resolved.map((r) => r.type).sort();
    expect(types).toEqual(["company", "group"]);

    // Verify DB has both references
    const refs = await db
      .select()
      .from(references)
      .where(
        and(
          eq(references.sourceType, "event"),
          eq(references.sourceId, event.id),
          eq(references.field, "organizer"),
        ),
      );

    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.targetType).sort()).toEqual(["company", "group"]);
  });

  it("handles mix of resolved and unresolved organizers", async () => {
    await db.insert(groups).values({
      slug: "devnl",
      name: "DevNL",
      description: "",
    });

    const [event] = await db
      .insert(events)
      .values({
        slug: "mixed-meetup",
        title: "Mixed Meetup",
        description: "",
        link: "https://example.com",
        organizer: "DevNL, Unknown Org",
      })
      .returning();

    const result = await syncOrganizerReferences(
      event.id,
      "DevNL, Unknown Org",
    );

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]).toMatchObject({
      type: "group",
      name: "DevNL",
    });
    expect(result.unresolved).toEqual(["Unknown Org"]);
  });

  it("deletes old organizer references before creating new ones", async () => {
    const [groupA] = await db
      .insert(groups)
      .values({
        slug: "group-a",
        name: "Group A",
        description: "",
      })
      .returning();

    const [groupB] = await db
      .insert(groups)
      .values({
        slug: "group-b",
        name: "Group B",
        description: "",
      })
      .returning();

    const [event] = await db
      .insert(events)
      .values({
        slug: "evolving-event",
        title: "Evolving Event",
        description: "",
        link: "https://example.com",
        organizer: "Group A",
      })
      .returning();

    // First sync: organizer = "Group A"
    await syncOrganizerReferences(event.id, "Group A");

    let refs = await db
      .select()
      .from(references)
      .where(
        and(
          eq(references.sourceType, "event"),
          eq(references.sourceId, event.id),
          eq(references.field, "organizer"),
        ),
      );
    expect(refs).toHaveLength(1);
    expect(refs[0].targetId).toBe(groupA.id);

    // Second sync: organizer changed to "Group B"
    await syncOrganizerReferences(event.id, "Group B");

    refs = await db
      .select()
      .from(references)
      .where(
        and(
          eq(references.sourceType, "event"),
          eq(references.sourceId, event.id),
          eq(references.field, "organizer"),
        ),
      );
    // Old reference deleted, only new one remains
    expect(refs).toHaveLength(1);
    expect(refs[0].targetId).toBe(groupB.id);
    expect(refs[0].referenceText).toBe("Group B");
  });

  it("handles null organizer gracefully", async () => {
    const [event] = await db
      .insert(events)
      .values({
        slug: "no-organizer",
        title: "No Organizer Event",
        description: "",
        link: "https://example.com",
      })
      .returning();

    // Seed a stale reference that should be cleaned up
    await db.insert(references).values({
      sourceType: "event",
      sourceId: event.id,
      targetType: "group",
      targetId: 999,
      referenceText: "Old Group",
      relation: "Organizer",
      field: "organizer",
    });

    const result = await syncOrganizerReferences(event.id, null);

    expect(result.resolved).toHaveLength(0);
    expect(result.unresolved).toHaveLength(0);

    // Verify the stale reference was deleted
    const refs = await db
      .select()
      .from(references)
      .where(
        and(
          eq(references.sourceType, "event"),
          eq(references.sourceId, event.id),
          eq(references.field, "organizer"),
        ),
      );
    expect(refs).toHaveLength(0);
  });
});
