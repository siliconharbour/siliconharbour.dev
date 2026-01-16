import { db } from "~/db";
import { events, eventDates, type Event, type EventDate, type NewEvent, type NewEventDate } from "~/db/schema";
import { eq, gte, and, lte, asc, desc } from "drizzle-orm";
import { deleteImage } from "./images.server";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";

export type EventWithDates = Event & { dates: EventDate[] };

/**
 * Get all existing event slugs (for uniqueness check)
 */
async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: events.slug }).from(events);
  return rows.map(r => r.slug);
}

/**
 * Generate a unique slug for an event based on title
 */
export async function generateEventSlug(title: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(title);
  let existingSlugs = await getExistingSlugs();
  
  // If updating, exclude the current event's slug from the check
  if (excludeId) {
    const current = await db.select({ slug: events.slug }).from(events).where(eq(events.id, excludeId)).get();
    if (current) {
      existingSlugs = existingSlugs.filter(s => s !== current.slug);
    }
  }
  
  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createEvent(
  event: Omit<NewEvent, "slug">,
  dates: Omit<NewEventDate, "eventId">[]
): Promise<EventWithDates> {
  // Generate unique slug from title
  const slug = await generateEventSlug(event.title);
  
  const [newEvent] = await db.insert(events).values({ ...event, slug }).returning();

  const newDates = await Promise.all(
    dates.map(async (date) => {
      const [newDate] = await db
        .insert(eventDates)
        .values({ ...date, eventId: newEvent.id })
        .returning();
      return newDate;
    })
  );

  // Sync references from description
  await syncReferences("event", newEvent.id, newEvent.description);

  return { ...newEvent, dates: newDates };
}

export async function updateEvent(
  id: number,
  event: Partial<Omit<NewEvent, "slug">>,
  dates?: Omit<NewEventDate, "eventId">[]
): Promise<EventWithDates | null> {
  // If title is being updated, regenerate slug
  let updateData: Partial<NewEvent> = { ...event, updatedAt: new Date() };
  if (event.title) {
    updateData.slug = await generateEventSlug(event.title, id);
  }
  
  const [updated] = await db
    .update(events)
    .set(updateData)
    .where(eq(events.id, id))
    .returning();

  if (!updated) return null;

  // Sync references if description changed
  if (event.description) {
    await syncReferences("event", id, event.description);
  }

  if (dates) {
    // Delete existing dates and insert new ones
    await db.delete(eventDates).where(eq(eventDates.eventId, id));
    
    const newDates = await Promise.all(
      dates.map(async (date) => {
        const [newDate] = await db
          .insert(eventDates)
          .values({ ...date, eventId: id })
          .returning();
        return newDate;
      })
    );

    return { ...updated, dates: newDates };
  }

  const existingDates = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, id));

  return { ...updated, dates: existingDates };
}

export async function deleteEvent(id: number): Promise<boolean> {
  const event = await getEventById(id);
  if (!event) return false;

  // Delete associated images
  if (event.coverImage) {
    await deleteImage(event.coverImage);
  }
  if (event.iconImage) {
    await deleteImage(event.iconImage);
  }

  await db.delete(events).where(eq(events.id, id));
  return true;
}

export async function getEventById(id: number): Promise<EventWithDates | null> {
  const event = await db.select().from(events).where(eq(events.id, id)).get();
  if (!event) return null;

  const dates = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, id))
    .orderBy(asc(eventDates.startDate));

  return { ...event, dates };
}

export async function getEventBySlug(slug: string): Promise<EventWithDates | null> {
  const event = await db.select().from(events).where(eq(events.slug, slug)).get();
  if (!event) return null;

  const dates = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, event.id))
    .orderBy(asc(eventDates.startDate));

  return { ...event, dates };
}

export async function getAllEvents(): Promise<EventWithDates[]> {
  const allEvents = await db.select().from(events).orderBy(desc(events.createdAt));

  const eventsWithDates = await Promise.all(
    allEvents.map(async (event) => {
      const dates = await db
        .select()
        .from(eventDates)
        .where(eq(eventDates.eventId, event.id))
        .orderBy(asc(eventDates.startDate));
      return { ...event, dates };
    })
  );

  return eventsWithDates;
}

export async function getUpcomingEvents(): Promise<EventWithDates[]> {
  const now = new Date();
  
  // Get all events that have at least one date >= now
  const upcomingEventIds = await db
    .selectDistinct({ eventId: eventDates.eventId })
    .from(eventDates)
    .where(gte(eventDates.startDate, now));

  if (upcomingEventIds.length === 0) return [];

  const eventsWithDates = await Promise.all(
    upcomingEventIds.map(async ({ eventId }) => {
      return getEventById(eventId);
    })
  );

  // Filter nulls and sort by earliest upcoming date
  return eventsWithDates
    .filter((e): e is EventWithDates => e !== null)
    .sort((a, b) => {
      const aNext = a.dates.find((d) => d.startDate >= now)?.startDate;
      const bNext = b.dates.find((d) => d.startDate >= now)?.startDate;
      if (!aNext || !bNext) return 0;
      return aNext.getTime() - bNext.getTime();
    });
}

export async function getEventsThisWeek(): Promise<EventWithDates[]> {
  const now = new Date();
  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const eventIdsThisWeek = await db
    .selectDistinct({ eventId: eventDates.eventId })
    .from(eventDates)
    .where(
      and(
        gte(eventDates.startDate, now),
        lte(eventDates.startDate, weekFromNow)
      )
    );

  if (eventIdsThisWeek.length === 0) return [];

  const eventsWithDates = await Promise.all(
    eventIdsThisWeek.map(async ({ eventId }) => {
      return getEventById(eventId);
    })
  );

  return eventsWithDates
    .filter((e): e is EventWithDates => e !== null)
    .sort((a, b) => {
      const aNext = a.dates.find((d) => d.startDate >= now)?.startDate;
      const bNext = b.dates.find((d) => d.startDate >= now)?.startDate;
      if (!aNext || !bNext) return 0;
      return aNext.getTime() - bNext.getTime();
    });
}

export async function getEventsByMonth(year: number, month: number): Promise<EventWithDates[]> {
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

  const eventIdsInMonth = await db
    .selectDistinct({ eventId: eventDates.eventId })
    .from(eventDates)
    .where(
      and(
        gte(eventDates.startDate, startOfMonth),
        lte(eventDates.startDate, endOfMonth)
      )
    );

  if (eventIdsInMonth.length === 0) return [];

  const eventsWithDates = await Promise.all(
    eventIdsInMonth.map(async ({ eventId }) => {
      return getEventById(eventId);
    })
  );

  return eventsWithDates.filter((e): e is EventWithDates => e !== null);
}
