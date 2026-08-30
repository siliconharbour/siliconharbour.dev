import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  eventTagAssignments,
  eventTagColors,
  eventTags,
  type EventTag,
  type EventTagColor,
} from "~/db/schema";
import { generateSlug } from "~/lib/slug";

export type EventTagWithUsage = EventTag & { eventCount: number };

export function isEventTagColor(value: string): value is EventTagColor {
  return (eventTagColors as readonly string[]).includes(value);
}

export async function getEventTags(): Promise<EventTag[]> {
  return db.select().from(eventTags).orderBy(asc(eventTags.name));
}

export async function getEventTagsWithUsage(): Promise<EventTagWithUsage[]> {
  return db
    .select({
      id: eventTags.id,
      name: eventTags.name,
      slug: eventTags.slug,
      color: eventTags.color,
      createdAt: eventTags.createdAt,
      updatedAt: eventTags.updatedAt,
      eventCount: sql<number>`count(${eventTagAssignments.id})`,
    })
    .from(eventTags)
    .leftJoin(eventTagAssignments, eq(eventTagAssignments.tagId, eventTags.id))
    .groupBy(eventTags.id)
    .orderBy(asc(eventTags.name));
}

export async function createEventTag(name: string, color: EventTagColor): Promise<EventTag> {
  const cleanName = name.trim();
  const slug = generateSlug(cleanName);
  if (!cleanName || !slug) throw new Error("Tag name is required.");
  try {
    const [tag] = await db.insert(eventTags).values({ name: cleanName, slug, color }).returning();
    return tag;
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("An event tag with that name already exists.");
    }
    throw error;
  }
}

export async function updateEventTag(id: number, name: string, color: EventTagColor) {
  const cleanName = name.trim();
  const slug = generateSlug(cleanName);
  if (!cleanName || !slug) throw new Error("Tag name is required.");
  try {
    await db
      .update(eventTags)
      .set({ name: cleanName, slug, color, updatedAt: new Date() })
      .where(eq(eventTags.id, id));
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("An event tag with that name already exists.");
    }
    throw error;
  }
}

export async function deleteEventTag(id: number) {
  await db.delete(eventTags).where(eq(eventTags.id, id));
}

export async function getTagsForEvents(eventIds: number[]): Promise<Map<number, EventTag[]>> {
  const tagsByEvent = new Map<number, EventTag[]>();
  if (eventIds.length === 0) return tagsByEvent;
  const rows = await db
    .select({ eventId: eventTagAssignments.eventId, tag: eventTags })
    .from(eventTagAssignments)
    .innerJoin(eventTags, eq(eventTags.id, eventTagAssignments.tagId))
    .where(inArray(eventTagAssignments.eventId, eventIds))
    .orderBy(asc(eventTags.name));
  for (const row of rows) {
    const assigned = tagsByEvent.get(row.eventId) ?? [];
    assigned.push(row.tag);
    tagsByEvent.set(row.eventId, assigned);
  }
  return tagsByEvent;
}

export async function validateEventTagIds(tagIds: number[]) {
  const uniqueTagIds = [...new Set(tagIds)];
  if (uniqueTagIds.length > 0) {
    const existing = await db
      .select({ id: eventTags.id })
      .from(eventTags)
      .where(inArray(eventTags.id, uniqueTagIds));
    if (existing.length !== uniqueTagIds.length) throw new Error("One or more event tags are invalid.");
  }
  return uniqueTagIds;
}

export async function setEventTags(eventId: number, tagIds: number[]) {
  const uniqueTagIds = await validateEventTagIds(tagIds);
  await db.delete(eventTagAssignments).where(eq(eventTagAssignments.eventId, eventId));
  if (uniqueTagIds.length > 0) {
    await db.insert(eventTagAssignments).values(uniqueTagIds.map((tagId) => ({ eventId, tagId })));
  }
}

export async function getEventTagIdsBySlugs(slugs: string[]): Promise<number[]> {
  const uniqueSlugs = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (uniqueSlugs.length === 0) return [];
  const found = await db
    .select({ id: eventTags.id, slug: eventTags.slug })
    .from(eventTags)
    .where(inArray(eventTags.slug, uniqueSlugs));
  if (found.length !== uniqueSlugs.length) {
    const foundSlugs = new Set(found.map((tag) => tag.slug));
    const missing = uniqueSlugs.filter((slug) => !foundSlugs.has(slug));
    throw new Error(`Unknown event tag${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
  }
  return found.map((tag) => tag.id);
}
