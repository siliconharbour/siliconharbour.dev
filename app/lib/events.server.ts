import { db } from "~/db";
import { 
  events, 
  eventDates, 
  eventOccurrences,
  type Event, 
  type EventDate, 
  type NewEvent, 
  type NewEventDate,
  type EventOccurrence,
  type NewEventOccurrence,
} from "~/db/schema";
import { eq, gte, and, lte, asc, desc, count, inArray } from "drizzle-orm";
import { deleteImage } from "./images.server";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";
import { parseRecurrenceRule, generateOccurrences } from "./recurrence.server";

export type EventWithDates = Event & { dates: EventDate[] };

/**
 * Represents a single occurrence of an event (either from eventDates or generated from recurrence)
 */
export interface EventOccurrenceDisplay {
  eventId: number;
  date: Date;
  endDate: Date | null;
  // Override fields (may be different from base event)
  location: string | null;
  description: string | null;
  link: string | null;
  cancelled: boolean;
  // Source info
  isGenerated: boolean; // true if from recurrence, false if from eventDates
  overrideId?: number; // ID in eventOccurrences table if there's an override
}

export type EventWithOccurrences = Event & { 
  dates: EventDate[];
  occurrences: EventOccurrenceDisplay[];
};

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
  const threeMonthsFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  
  // Get all events that have at least one explicit date >= now
  const upcomingEventIds = await db
    .selectDistinct({ eventId: eventDates.eventId })
    .from(eventDates)
    .where(gte(eventDates.startDate, now));

  // Also get recurring events
  const recurringEventsResult = await db
    .select()
    .from(events)
    .where(gte(events.recurrenceRule, ""));
  
  const recurringEvents = recurringEventsResult.filter(e => e.recurrenceRule);
  
  // Combine IDs
  const allEventIds = new Set([
    ...upcomingEventIds.map(r => r.eventId),
    ...recurringEvents.map(e => e.id),
  ]);

  if (allEventIds.size === 0) return [];

  const eventsWithDates = await Promise.all(
    Array.from(allEventIds).map(async (eventId) => {
      const eventData = await getEventById(eventId);
      if (!eventData) return null;
      
      // For recurring events, generate upcoming dates
      if (eventData.recurrenceRule) {
        const generatedDates = getGeneratedOccurrences(eventData, now, threeMonthsFromNow);
        // Convert generated dates to EventDate format for consistency
        const syntheticDates: EventDate[] = generatedDates.map((date, i) => {
          let startDateTime = new Date(date);
          if (eventData.defaultStartTime) {
            const [hour, min] = eventData.defaultStartTime.split(":").map(Number);
            startDateTime.setHours(hour, min, 0, 0);
          }
          
          let endDateTime: Date | null = null;
          if (eventData.defaultEndTime) {
            const [hour, min] = eventData.defaultEndTime.split(":").map(Number);
            endDateTime = new Date(date);
            endDateTime.setHours(hour, min, 0, 0);
          }
          
          return {
            id: -(i + 1), // Negative IDs for synthetic dates
            eventId: eventData.id,
            startDate: startDateTime,
            endDate: endDateTime,
          };
        });
        
        return { ...eventData, dates: syntheticDates };
      }
      
      return eventData;
    })
  );

  // Filter nulls, filter to only those with upcoming dates, and sort
  return eventsWithDates
    .filter((e): e is EventWithDates => e !== null)
    .filter(e => e.dates.some(d => d.startDate >= now))
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

// =============================================================================
// Paginated queries with search
// =============================================================================

export interface PaginatedEvents {
  items: EventWithDates[];
  total: number;
}

export type EventFilter = "upcoming" | "past" | "all";

export async function getPaginatedEvents(
  limit: number,
  offset: number,
  searchQuery?: string,
  filter: EventFilter = "upcoming",
  dateFilter?: string // yyyy-MM-dd format
): Promise<PaginatedEvents> {
  const now = new Date();
  const threeMonthsFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  
  // Get recurring events (they're always considered "upcoming" if no end date or end date is in future)
  const recurringEventsResult = await db
    .select()
    .from(events)
    .where(gte(events.recurrenceRule, ""));
  const recurringEvents = recurringEventsResult.filter(e => e.recurrenceRule);
  const recurringEventIds = recurringEvents
    .filter(e => !e.recurrenceEnd || e.recurrenceEnd > now)
    .map(e => e.id);
  
  // Get event IDs based on filter
  let filteredEventIds: number[];
  
  // If filtering by specific date, get events on that date
  if (dateFilter) {
    // Parse yyyy-MM-dd and create UTC day boundaries
    const [year, month, day] = dateFilter.split("-").map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    
    const dateRows = await db
      .selectDistinct({ eventId: eventDates.eventId })
      .from(eventDates)
      .where(and(
        gte(eventDates.startDate, startOfDay),
        lte(eventDates.startDate, endOfDay)
      ));
    
    // Also check if any recurring events fall on this date
    const recurringOnDate: number[] = [];
    for (const event of recurringEvents) {
      const occurrences = getGeneratedOccurrences(event, startOfDay, endOfDay);
      if (occurrences.length > 0) {
        recurringOnDate.push(event.id);
      }
    }
    
    filteredEventIds = [...new Set([...dateRows.map(r => r.eventId), ...recurringOnDate])];
  } else if (filter === "upcoming") {
    const upcomingRows = await db
      .selectDistinct({ eventId: eventDates.eventId })
      .from(eventDates)
      .where(gte(eventDates.startDate, now));
    
    // Include recurring events as upcoming
    filteredEventIds = [...new Set([...upcomingRows.map(r => r.eventId), ...recurringEventIds])];
  } else if (filter === "past") {
    // Past events: all events that have NO upcoming dates AND are not recurring
    const upcomingRows = await db
      .selectDistinct({ eventId: eventDates.eventId })
      .from(eventDates)
      .where(gte(eventDates.startDate, now));
    const upcomingIds = new Set([...upcomingRows.map(r => r.eventId), ...recurringEventIds]);
    
    const allRows = await db.selectDistinct({ eventId: eventDates.eventId }).from(eventDates);
    filteredEventIds = allRows.map(r => r.eventId).filter(id => !upcomingIds.has(id));
  } else {
    // All events - include both one-time and recurring
    const allRows = await db.selectDistinct({ eventId: eventDates.eventId }).from(eventDates);
    filteredEventIds = [...new Set([...allRows.map(r => r.eventId), ...recurringEventIds])];
  }
  
  if (filteredEventIds.length === 0) {
    return { items: [], total: 0 };
  }
  
  // If searching, intersect with FTS results
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("event", searchQuery);
    filteredEventIds = filteredEventIds.filter(id => matchingIds.includes(id));
    
    if (filteredEventIds.length === 0) {
      return { items: [], total: 0 };
    }
  }
  
  const total = filteredEventIds.length;
  
  // Get the paginated slice of event IDs
  const paginatedIds = filteredEventIds.slice(offset, offset + limit);
  
  // Fetch full event data with dates (including generated dates for recurring events)
  const eventsWithDates = await Promise.all(
    paginatedIds.map(async (id) => {
      const event = await getEventById(id);
      if (!event) return null;
      
      // For recurring events, generate synthetic dates
      if (event.recurrenceRule) {
        const generatedDates = getGeneratedOccurrences(event, now, threeMonthsFromNow);
        const syntheticDates: EventDate[] = generatedDates.map((date, i) => {
          let startDateTime = new Date(date);
          if (event.defaultStartTime) {
            const [hour, min] = event.defaultStartTime.split(":").map(Number);
            startDateTime.setHours(hour, min, 0, 0);
          }
          
          let endDateTime: Date | null = null;
          if (event.defaultEndTime) {
            const [hour, min] = event.defaultEndTime.split(":").map(Number);
            endDateTime = new Date(date);
            endDateTime.setHours(hour, min, 0, 0);
          }
          
          return {
            id: -(i + 1),
            eventId: event.id,
            startDate: startDateTime,
            endDate: endDateTime,
          };
        });
        
        return { ...event, dates: syntheticDates };
      }
      
      return event;
    })
  );
  
  const items = eventsWithDates.filter((e): e is EventWithDates => e !== null);
  
  // Sort by next date
  items.sort((a, b) => {
    const aNext = a.dates.find(d => filter === "past" ? true : d.startDate >= now)?.startDate;
    const bNext = b.dates.find(d => filter === "past" ? true : d.startDate >= now)?.startDate;
    if (!aNext || !bNext) return 0;
    return filter === "past" 
      ? bNext.getTime() - aNext.getTime()  // Past: newest first
      : aNext.getTime() - bNext.getTime(); // Upcoming: soonest first
  });
  
  return { items, total };
}

// =============================================================================
// Recurring event functions
// =============================================================================

/**
 * Get all occurrence overrides for an event
 */
export async function getEventOccurrenceOverrides(eventId: number): Promise<EventOccurrence[]> {
  return db
    .select()
    .from(eventOccurrences)
    .where(eq(eventOccurrences.eventId, eventId))
    .orderBy(asc(eventOccurrences.occurrenceDate));
}

/**
 * Get a specific occurrence override
 */
export async function getOccurrenceOverride(
  eventId: number, 
  occurrenceDate: Date
): Promise<EventOccurrence | null> {
  // Normalize the date to start of day for comparison
  const startOfDay = new Date(occurrenceDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setHours(23, 59, 59, 999);
  
  const result = await db
    .select()
    .from(eventOccurrences)
    .where(and(
      eq(eventOccurrences.eventId, eventId),
      gte(eventOccurrences.occurrenceDate, startOfDay),
      lte(eventOccurrences.occurrenceDate, endOfDay)
    ))
    .get();
  
  return result || null;
}

/**
 * Create or update an occurrence override
 */
export async function upsertOccurrenceOverride(
  eventId: number,
  occurrenceDate: Date,
  override: Partial<Omit<NewEventOccurrence, "eventId" | "occurrenceDate" | "createdAt">>
): Promise<EventOccurrence> {
  const existing = await getOccurrenceOverride(eventId, occurrenceDate);
  
  if (existing) {
    const [updated] = await db
      .update(eventOccurrences)
      .set(override)
      .where(eq(eventOccurrences.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(eventOccurrences)
      .values({
        eventId,
        occurrenceDate,
        ...override,
      })
      .returning();
    return created;
  }
}

/**
 * Delete an occurrence override
 */
export async function deleteOccurrenceOverride(id: number): Promise<boolean> {
  await db.delete(eventOccurrences).where(eq(eventOccurrences.id, id));
  return true;
}

/**
 * Cancel a specific occurrence of a recurring event
 */
export async function cancelOccurrence(eventId: number, occurrenceDate: Date): Promise<void> {
  await upsertOccurrenceOverride(eventId, occurrenceDate, { cancelled: true });
}

/**
 * Uncancel a specific occurrence
 */
export async function uncancelOccurrence(eventId: number, occurrenceDate: Date): Promise<void> {
  await upsertOccurrenceOverride(eventId, occurrenceDate, { cancelled: false });
}

/**
 * Generate all occurrences for a recurring event within a date range
 */
export function getGeneratedOccurrences(
  event: Event,
  startDate: Date = new Date(),
  endDate: Date = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 3 months default
): Date[] {
  if (!event.recurrenceRule) return [];
  
  const rule = parseRecurrenceRule(event.recurrenceRule);
  if (!rule) return [];
  
  const effectiveEnd = event.recurrenceEnd && event.recurrenceEnd < endDate 
    ? event.recurrenceEnd 
    : endDate;
  
  return generateOccurrences(rule, startDate, effectiveEnd);
}

/**
 * Get event with all its occurrences (both from eventDates and generated from recurrence)
 */
export async function getEventWithOccurrences(
  eventId: number,
  rangeStart: Date = new Date(),
  rangeEnd: Date = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
): Promise<EventWithOccurrences | null> {
  const event = await getEventById(eventId);
  if (!event) return null;
  
  const occurrences: EventOccurrenceDisplay[] = [];
  
  // If this is a recurring event, generate occurrences
  if (event.recurrenceRule) {
    const generatedDates = getGeneratedOccurrences(event, rangeStart, rangeEnd);
    const overrides = await getEventOccurrenceOverrides(eventId);
    
    // Create a map of overrides by date (normalized to start of day)
    const overrideMap = new Map<string, EventOccurrence>();
    for (const override of overrides) {
      const dateKey = override.occurrenceDate.toISOString().split("T")[0];
      overrideMap.set(dateKey, override);
    }
    
    // Build occurrences from generated dates with any overrides applied
    for (const date of generatedDates) {
      const dateKey = date.toISOString().split("T")[0];
      const override = overrideMap.get(dateKey);
      
      // Calculate start and end times
      let startTime = event.defaultStartTime || "18:00";
      let endTime = event.defaultEndTime || null;
      
      if (override?.startTime) startTime = override.startTime;
      if (override?.endTime) endTime = override.endTime;
      
      // Parse time and combine with date
      const [startHour, startMin] = startTime.split(":").map(Number);
      const startDateTime = new Date(date);
      startDateTime.setHours(startHour, startMin, 0, 0);
      
      let endDateTime: Date | null = null;
      if (endTime) {
        const [endHour, endMin] = endTime.split(":").map(Number);
        endDateTime = new Date(date);
        endDateTime.setHours(endHour, endMin, 0, 0);
      }
      
      occurrences.push({
        eventId: event.id,
        date: startDateTime,
        endDate: endDateTime,
        location: override?.location ?? event.location,
        description: override?.description ?? null, // Only show override description if set
        link: override?.link ?? event.link,
        cancelled: override?.cancelled ?? false,
        isGenerated: true,
        overrideId: override?.id,
      });
    }
  } else {
    // For non-recurring events, convert eventDates to occurrences
    for (const date of event.dates) {
      occurrences.push({
        eventId: event.id,
        date: date.startDate,
        endDate: date.endDate,
        location: event.location,
        description: null,
        link: event.link,
        cancelled: false,
        isGenerated: false,
      });
    }
  }
  
  // Sort by date
  occurrences.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  return { ...event, occurrences };
}

/**
 * Check if an event is recurring
 */
export function isRecurringEvent(event: Event): boolean {
  return !!event.recurrenceRule;
}

/**
 * Get upcoming occurrences for all recurring events (for calendar/listings)
 */
export async function getUpcomingRecurringOccurrences(
  startDate: Date = new Date(),
  endDate: Date = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
): Promise<Array<EventOccurrenceDisplay & { event: Event }>> {
  // Get all events with recurrence rules
  const recurringEvents = await db
    .select()
    .from(events)
    .where(and(
      // Has a recurrence rule
      gte(events.recurrenceRule, "")
    ));
  
  // Filter to only those with actual rules
  const eventsWithRules = recurringEvents.filter(e => e.recurrenceRule);
  
  const allOccurrences: Array<EventOccurrenceDisplay & { event: Event }> = [];
  
  for (const event of eventsWithRules) {
    const eventWithOccurrences = await getEventWithOccurrences(event.id, startDate, endDate);
    if (eventWithOccurrences) {
      for (const occurrence of eventWithOccurrences.occurrences) {
        if (!occurrence.cancelled && occurrence.date >= startDate && occurrence.date <= endDate) {
          allOccurrences.push({ ...occurrence, event });
        }
      }
    }
  }
  
  // Sort by date
  allOccurrences.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  return allOccurrences;
}
