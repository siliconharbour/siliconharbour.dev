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
  type EventTag,
} from "~/db/schema";
import { eq, gte, and, lte, lt, asc, desc, isNull, or, inArray } from "drizzle-orm";
import { deleteImage } from "./images.server";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences, syncOrganizerReferences } from "./references.server";
import { searchContentIds } from "./search.server";
import { parseRecurrenceRule, generateOccurrences } from "./recurrence.server";
import {
  parseAsTimezone,
  getDateInTimezone,
  getDayBoundsInTimezone,
  SITE_TIMEZONE,
} from "./timezone";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { addDays, startOfDay } from "date-fns";
import { siteDayBounds, validatePeriodDates } from "./event-timing";
import { assertValidEventStructure } from "./event-periods.server";
import { getTagsForEvents, setEventTags, validateEventTagIds } from "./event-tags.server";

export type EventWithDates = Event & { dates: EventDate[]; tags?: EventTag[] };
export type EventSummary = Pick<Event, "id" | "slug" | "title" | "timeMode">;
export type EventWithRelations = EventWithDates & {
  parentEvent: EventSummary | null;
  childEvents: EventWithDates[];
};

/**
 * Batch-fetch dates for multiple events in a single query, avoiding N+1.
 * Returns events with their dates attached, preserving input order.
 */
async function attachDates(eventList: Event[]): Promise<EventWithDates[]> {
  if (eventList.length === 0) return [];
  const ids = eventList.map((e) => e.id);
  const allDates = await db
    .select()
    .from(eventDates)
    .where(inArray(eventDates.eventId, ids))
    .orderBy(asc(eventDates.startDate));
  const tagsByEvent = await getTagsForEvents(ids);
  const datesByEvent = new Map<number, EventDate[]>();
  for (const d of allDates) {
    const list = datesByEvent.get(d.eventId) ?? [];
    list.push(d);
    datesByEvent.set(d.eventId, list);
  }
  return eventList.map((event) => ({
    ...event,
    dates: datesByEvent.get(event.id) ?? [],
    tags: tagsByEvent.get(event.id) ?? [],
  }));
}

/** Filter: show manually-created events (importStatus IS NULL) and published imports */
const isPubliclyVisible = or(isNull(events.importStatus), eq(events.importStatus, "published"));

/** Matches dates that occur on or after the given local calendar day. */
function isCurrentOnOrAfter(dayStart: Date) {
  return or(gte(eventDates.startDate, dayStart), gte(eventDates.endDate, dayStart));
}

/** An event date is "upcoming or in progress" if it starts in the future OR has already started but not yet ended */
function isUpcomingOrInProgress(date: EventDate, now: Date): boolean {
  const { start: todayStart } = siteDayBounds(now);
  return (date.endDate ?? date.startDate) >= todayStart;
}

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
  return rows.map((r) => r.slug);
}

/**
 * Generate a unique slug for an event based on title
 */
export async function generateEventSlug(title: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(title);
  let existingSlugs = await getExistingSlugs();

  // If updating, exclude the current event's slug from the check
  if (excludeId) {
    const current = await db
      .select({ slug: events.slug })
      .from(events)
      .where(eq(events.id, excludeId))
      .get();
    if (current) {
      existingSlugs = existingSlugs.filter((s) => s !== current.slug);
    }
  }

  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createEvent(
  event: Omit<NewEvent, "slug">,
  dates: Omit<NewEventDate, "eventId">[],
  tagIds: number[] = [],
): Promise<EventWithDates> {
  await validateEventTagIds(tagIds);
  const validationError = validatePeriodDates(event.timeMode ?? "scheduled", dates);
  if (validationError) throw new Error(validationError);
  await assertValidEventStructure({
    nextTimeMode: event.timeMode ?? "scheduled",
    parentEventId: event.parentEventId ?? null,
  });
  // Generate unique slug from title
  const slug = await generateEventSlug(event.title);

  const [newEvent] = await db
    .insert(events)
    .values({ ...event, slug })
    .returning();

  const newDates = await Promise.all(
    dates.map(async (date) => {
      const [newDate] = await db
        .insert(eventDates)
        .values({ ...date, eventId: newEvent.id })
        .returning();
      return newDate;
    }),
  );

  // Sync references from description
  await syncReferences("event", newEvent.id, newEvent.description, "description");

  // Sync organizer references
  await syncOrganizerReferences(newEvent.id, newEvent.organizer);
  await setEventTags(newEvent.id, tagIds);

  const tags = (await getTagsForEvents([newEvent.id])).get(newEvent.id) ?? [];
  return { ...newEvent, dates: newDates, tags };
}

export async function updateEvent(
  id: number,
  event: Partial<Omit<NewEvent, "slug">>,
  dates?: Omit<NewEventDate, "eventId">[],
  tagIds?: number[],
): Promise<EventWithDates | null> {
  if (tagIds !== undefined) await validateEventTagIds(tagIds);
  const current = await db.select().from(events).where(eq(events.id, id)).get();
  if (!current) return null;
  const nextTimeMode = event.timeMode ?? current.timeMode;
  const nextDates = dates ?? (await db.select().from(eventDates).where(eq(eventDates.eventId, id)));
  const validationError = validatePeriodDates(nextTimeMode, nextDates);
  if (validationError) throw new Error(validationError);
  const nextParentEventId =
    event.parentEventId === undefined ? current.parentEventId : event.parentEventId;
  await assertValidEventStructure({
    eventId: id,
    currentTimeMode: current.timeMode,
    nextTimeMode,
    parentEventId: nextParentEventId,
  });
  // If title is being updated, regenerate slug
  let updateData: Partial<NewEvent> = { ...event, updatedAt: new Date() };
  if (event.title) {
    updateData.slug = await generateEventSlug(event.title, id);
  }

  const [updated] = await db.update(events).set(updateData).where(eq(events.id, id)).returning();

  if (!updated) return null;

  // Sync references if description changed
  if (event.description) {
    await syncReferences("event", id, event.description, "description");
  }

  // Sync organizer references if organizer changed
  if (event.organizer !== undefined) {
    await syncOrganizerReferences(id, event.organizer);
  }
  if (tagIds !== undefined) await setEventTags(id, tagIds);

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
      }),
    );

    const tags = (await getTagsForEvents([id])).get(id) ?? [];
    return { ...updated, dates: newDates, tags };
  }

  const existingDates = await db.select().from(eventDates).where(eq(eventDates.eventId, id));

  const tags = (await getTagsForEvents([id])).get(id) ?? [];
  return { ...updated, dates: existingDates, tags };
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

  const tags = (await getTagsForEvents([id])).get(id) ?? [];
  return { ...event, dates, tags };
}

export async function getEventBySlug(slug: string): Promise<EventWithDates | null> {
  const event = await db.select().from(events).where(eq(events.slug, slug)).get();
  if (!event) return null;

  const dates = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, event.id))
    .orderBy(asc(eventDates.startDate));

  const tags = (await getTagsForEvents([event.id])).get(event.id) ?? [];
  return { ...event, dates, tags };
}

export async function getEventRelations(event: EventWithDates): Promise<EventWithRelations> {
  const parent = event.parentEventId
    ? await db.select().from(events).where(eq(events.id, event.parentEventId)).get()
    : null;
  const children = await db
    .select()
    .from(events)
    .where(and(eq(events.parentEventId, event.id), isPubliclyVisible));
  const childEvents = (await attachDates(children)).sort(
    (a, b) => (a.dates[0]?.startDate.getTime() ?? 0) - (b.dates[0]?.startDate.getTime() ?? 0),
  );
  return {
    ...event,
    parentEvent: parent
      ? { id: parent.id, slug: parent.slug, title: parent.title, timeMode: parent.timeMode }
      : null,
    childEvents,
  };
}

/**
 * Public-safe variant of getEventBySlug.
 * Blocks access to imported events that haven't been published yet.
 */
export async function getPublicEventBySlug(slug: string): Promise<EventWithDates | null> {
  const event = await getEventBySlug(slug);
  if (!event) return null;
  // Block access to unpublished imported events
  if (event.importStatus !== null && event.importStatus !== "published") return null;
  return event;
}

export async function getAllEvents(): Promise<EventWithDates[]> {
  const allEvents = await db.select().from(events).orderBy(desc(events.createdAt));
  return attachDates(allEvents);
}

export async function getUpcomingEvents(): Promise<EventWithDates[]> {
  const now = new Date();
  const { start: todayStart } = siteDayBounds(now);
  const threeMonthsFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  // Get all events that have at least one explicit date that is upcoming or currently in progress
  const upcomingEventIds = await db
    .selectDistinct({ eventId: eventDates.eventId })
    .from(eventDates)
    .where(isCurrentOnOrAfter(todayStart));

  // Also get recurring events
  const recurringEventsResult = await db
    .select()
    .from(events)
    .where(and(gte(events.recurrenceRule, ""), isPubliclyVisible));

  const recurringEvents = recurringEventsResult.filter((e) => e.recurrenceRule);

  // Combine IDs
  const allEventIds = new Set([
    ...upcomingEventIds.map((r) => r.eventId),
    ...recurringEvents.map((e) => e.id),
  ]);

  if (allEventIds.size === 0) return [];

  const ids = Array.from(allEventIds);
  const eventRows = await db.select().from(events).where(inArray(events.id, ids));
  const batchedWithDates = await attachDates(eventRows);

  const eventsWithDates = batchedWithDates.map((eventData) => {
    if (eventData.recurrenceRule) {
      const generatedDates = getGeneratedOccurrences(eventData, todayStart, threeMonthsFromNow);
      const syntheticDates: EventDate[] = generatedDates.slice(0, 3).map((date, i) => {
        const dateStr = getDateInTimezone(date);
        const startTime = eventData.defaultStartTime || "00:00";
        const startDateTime = parseAsTimezone(dateStr, startTime);

        let endDateTime: Date | null = null;
        if (eventData.defaultEndTime) {
          endDateTime = parseAsTimezone(dateStr, eventData.defaultEndTime);
        }

        return {
          id: -(i + 1),
          eventId: eventData.id,
          startDate: startDateTime,
          endDate: endDateTime,
          isAllDay: !eventData.defaultStartTime,
        };
      });

      return { ...eventData, dates: syntheticDates };
    }

    return eventData;
  });

  // Filter unpublished imports, filter to only those with upcoming dates, and sort
  return eventsWithDates
    .filter((e) => e.importStatus === null || e.importStatus === "published")
    .filter((e) => e.dates.some((d) => isUpcomingOrInProgress(d, now)))
    .sort((a, b) => {
      const aNext = a.dates.find((d) => isUpcomingOrInProgress(d, now))?.startDate;
      const bNext = b.dates.find((d) => isUpcomingOrInProgress(d, now))?.startDate;
      if (!aNext || !bNext) return 0;
      return aNext.getTime() - bNext.getTime();
    });
}

/**
 * Calendar event data - minimal payload for rendering dots on a calendar
 */
export interface CalendarEventData {
  id: number;
  slug: string;
  title: string;
  dates: string[]; // Array of "YYYY-MM-DD" date strings within the month
  isRecurring: boolean;
  isPeriod: boolean;
}

/**
 * Get all events that have occurrences in a given month.
 * Returns a minimal payload for calendar dot rendering.
 */
export async function getEventsForMonth(
  year: number,
  month: number, // 1-indexed (1 = January)
): Promise<CalendarEventData[]> {
  // Build month boundaries in Newfoundland timezone
  const monthStart = parseAsTimezone(`${year}-${String(month).padStart(2, "0")}-01`, "00:00");
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEnd = parseAsTimezone(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`, "00:00");

  const result: CalendarEventData[] = [];
  const seenEventIds = new Set<number>();

  // 1. One-time events with dates in this month
  const oneTimeDates = await db
    .select()
    .from(eventDates)
    .where(
      and(
        lt(eventDates.startDate, monthEnd),
        or(
          gte(eventDates.endDate, monthStart),
          and(isNull(eventDates.endDate), gte(eventDates.startDate, monthStart)),
        ),
      ),
    );

  // Group by event
  const eventDateMap = new Map<number, EventDate[]>();
  for (const ed of oneTimeDates) {
    if (!eventDateMap.has(ed.eventId)) {
      eventDateMap.set(ed.eventId, []);
    }
    eventDateMap.get(ed.eventId)!.push(ed);
  }

  // Fetch event details for one-time events
  for (const [eventId, dates] of eventDateMap) {
    const event = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), isPubliclyVisible))
      .get();
    if (event) {
      const dateStrs = new Set<string>();
      for (const date of dates) {
        const rangeStart = date.startDate > monthStart ? date.startDate : monthStart;
        const lastDayOfMonth = fromZonedTime(
          addDays(toZonedTime(monthEnd, SITE_TIMEZONE), -1),
          SITE_TIMEZONE,
        );
        const rangeEnd = date.endDate
          ? date.endDate < monthEnd
            ? date.endDate
            : lastDayOfMonth
          : date.startDate;
        let cursor = toZonedTime(rangeStart, SITE_TIMEZONE);
        const localEnd = toZonedTime(rangeEnd, SITE_TIMEZONE);
        while (cursor <= localEnd) {
          dateStrs.add(getDateInTimezone(fromZonedTime(cursor, SITE_TIMEZONE)));
          cursor = addDays(cursor, 1);
        }
      }
      seenEventIds.add(eventId);
      result.push({
        id: event.id,
        slug: event.slug,
        title: event.title,
        dates: [...dateStrs],
        isRecurring: false,
        isPeriod: event.timeMode === "period",
      });
    }
  }

  // 2. Recurring events - generate occurrences for this month
  const recurringEventsResult = await db
    .select()
    .from(events)
    .where(and(gte(events.recurrenceRule, ""), isPubliclyVisible));

  const recurringEventsList = recurringEventsResult.filter((e) => e.recurrenceRule);

  for (const event of recurringEventsList) {
    if (seenEventIds.has(event.id)) continue;

    const generatedDates = getGeneratedOccurrences(event, monthStart, monthEnd).filter(
      (date) => date < monthEnd,
    );
    if (generatedDates.length === 0) continue;

    // Get overrides to check for cancellations
    const overrides = await getEventOccurrenceOverrides(event.id);
    const cancelledDates = new Set(
      overrides.filter((o) => o.cancelled).map((o) => getDateInTimezone(o.occurrenceDate)),
    );

    const dateStrs = generatedDates
      .map((d) => getDateInTimezone(d))
      .filter((d) => !cancelledDates.has(d));

    if (dateStrs.length > 0) {
      result.push({
        id: event.id,
        slug: event.slug,
        title: event.title,
        dates: dateStrs,
        isRecurring: true,
        isPeriod: false,
      });
    }
  }

  return result;
}

export async function getEventsThisWeek(): Promise<EventWithDates[]> {
  // Use start-of-today in Newfoundland time so events earlier today still appear
  const zonedNow = toZonedTime(new Date(), SITE_TIMEZONE);
  const zonedStartOfDay = startOfDay(zonedNow);
  const todayStart = fromZonedTime(zonedStartOfDay, SITE_TIMEZONE);

  const weekFromNow = fromZonedTime(addDays(zonedStartOfDay, 7), SITE_TIMEZONE);

  // Only one-off events (with explicit dates) -- recurring events stay in
  // the "Upcoming > Recurring" section on the homepage
  const eventIdsThisWeek = await db
    .selectDistinct({ eventId: eventDates.eventId })
    .from(eventDates)
    .where(and(gte(eventDates.startDate, todayStart), lte(eventDates.startDate, weekFromNow)));

  if (eventIdsThisWeek.length === 0) return [];

  const ids = eventIdsThisWeek.map((r) => r.eventId);
  const eventRows = await db.select().from(events).where(inArray(events.id, ids));
  const eventsWithDates = await attachDates(eventRows);

  return eventsWithDates
    .filter((e) => e.importStatus === null || e.importStatus === "published")
    .filter((e) => !e.recurrenceRule) // exclude recurring even if they have explicit dates
    .sort((a, b) => {
      const aNext = a.dates.find((d) => d.startDate >= todayStart)?.startDate;
      const bNext = b.dates.find((d) => d.startDate >= todayStart)?.startDate;
      if (!aNext || !bNext) return 0;
      return aNext.getTime() - bNext.getTime();
    });
}

export async function getEventsByMonth(year: number, month: number): Promise<EventWithDates[]> {
  const startOfMonth = parseAsTimezone(`${year}-${String(month + 1).padStart(2, "0")}-01`, "00:00");
  const nextMonth = new Date(Date.UTC(year, month + 1, 1));
  const endOfMonth = parseAsTimezone(nextMonth.toISOString().slice(0, 10), "00:00");

  const eventIdsInMonth = await db
    .selectDistinct({ eventId: eventDates.eventId })
    .from(eventDates)
    .where(and(gte(eventDates.startDate, startOfMonth), lt(eventDates.startDate, endOfMonth)));

  if (eventIdsInMonth.length === 0) return [];

  const ids = eventIdsInMonth.map((r) => r.eventId);
  const eventRows = await db.select().from(events).where(inArray(events.id, ids));
  const eventsWithDates = await attachDates(eventRows);

  return eventsWithDates.filter((e) => e.importStatus === null || e.importStatus === "published");
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
  dateFilter?: string, // yyyy-MM-dd format
): Promise<PaginatedEvents> {
  const now = new Date();
  const { start: todayStart } = siteDayBounds(now);
  const threeMonthsFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  // Get recurring events (they're always considered "upcoming" if no end date or end date is in future)
  const recurringEventsResult = await db
    .select()
    .from(events)
    .where(and(gte(events.recurrenceRule, ""), isPubliclyVisible));
  const recurringEvents = recurringEventsResult.filter((e) => e.recurrenceRule);
  const recurringEventIds = recurringEvents
    .filter((e) => !e.recurrenceEnd || e.recurrenceEnd >= todayStart)
    .map((e) => e.id);

  // Get event IDs based on filter
  let filteredEventIds: number[];

  // If filtering by specific date, get events on that date
  if (dateFilter) {
    const { start: startOfDay, end: endOfDay } = getDayBoundsInTimezone(dateFilter);

    const dateRows = await db
      .selectDistinct({ eventId: eventDates.eventId })
      .from(eventDates)
      .where(
        and(
          lte(eventDates.startDate, endOfDay),
          or(
            gte(eventDates.endDate, startOfDay),
            and(isNull(eventDates.endDate), gte(eventDates.startDate, startOfDay)),
          ),
        ),
      );

    // Also check if any recurring events fall on this date
    const recurringOnDate: number[] = [];
    for (const event of recurringEvents) {
      const occurrences = getGeneratedOccurrences(event, startOfDay, endOfDay);
      if (occurrences.length > 0) {
        recurringOnDate.push(event.id);
      }
    }

    filteredEventIds = [...new Set([...dateRows.map((r) => r.eventId), ...recurringOnDate])];
  } else if (filter === "upcoming") {
    const upcomingRows = await db
      .selectDistinct({ eventId: eventDates.eventId })
      .from(eventDates)
      .where(isCurrentOnOrAfter(todayStart));

    // Include recurring events as upcoming
    filteredEventIds = [...new Set([...upcomingRows.map((r) => r.eventId), ...recurringEventIds])];
  } else if (filter === "past") {
    // Past events: all events that have NO upcoming dates AND are not recurring
    const upcomingRows = await db
      .selectDistinct({ eventId: eventDates.eventId })
      .from(eventDates)
      .where(isCurrentOnOrAfter(todayStart));
    const upcomingIds = new Set([...upcomingRows.map((r) => r.eventId), ...recurringEventIds]);

    const allRows = await db.selectDistinct({ eventId: eventDates.eventId }).from(eventDates);
    filteredEventIds = allRows.map((r) => r.eventId).filter((id) => !upcomingIds.has(id));
  } else {
    // All events - include both one-time and recurring
    const allRows = await db.selectDistinct({ eventId: eventDates.eventId }).from(eventDates);
    filteredEventIds = [...new Set([...allRows.map((r) => r.eventId), ...recurringEventIds])];
  }

  if (filteredEventIds.length === 0) {
    return { items: [], total: 0 };
  }

  // If searching, intersect with FTS results
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("event", searchQuery);
    filteredEventIds = filteredEventIds.filter((id) => matchingIds.includes(id));

    if (filteredEventIds.length === 0) {
      return { items: [], total: 0 };
    }
  }

  // Fetch full event data with dates for all matching events in batch.
  // Sorting requires date data, so we fetch first and slice after.
  const eventRows = await db.select().from(events).where(inArray(events.id, filteredEventIds));
  const batchedWithDates = await attachDates(eventRows);

  // For recurring events, replace stored dates with generated synthetic ones
  const eventsWithDates: (EventWithDates | null)[] = batchedWithDates.map((event) => {
    if (event.recurrenceRule) {
      const generatedDates = getGeneratedOccurrences(event, todayStart, threeMonthsFromNow);
      const syntheticDates: EventDate[] = generatedDates.slice(0, 3).map((date, i) => {
        const dateStr = getDateInTimezone(date);
        const startTime = event.defaultStartTime || "00:00";
        const startDateTime = parseAsTimezone(dateStr, startTime);

        let endDateTime: Date | null = null;
        if (event.defaultEndTime) {
          endDateTime = parseAsTimezone(dateStr, event.defaultEndTime);
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
  });

  const items = eventsWithDates
    .filter((e): e is EventWithDates => e !== null)
    .filter((e) => e.importStatus === null || e.importStatus === "published");

  // Recompute total after filtering out non-published events
  const actualTotal = items.length;

  // Sort by next date
  items.sort((a, b) => {
    if (filter === "past") {
      // Past: most recent first (use last date)
      const aDate = a.dates[a.dates.length - 1]?.startDate;
      const bDate = b.dates[b.dates.length - 1]?.startDate;
      if (!aDate || !bDate) return 0;
      return bDate.getTime() - aDate.getTime();
    }

    // Upcoming and All: upcoming events first (soonest), then past (most recent first)
    const aNext = a.dates.find((d) => isUpcomingOrInProgress(d, now))?.startDate;
    const bNext = b.dates.find((d) => isUpcomingOrInProgress(d, now))?.startDate;

    // Both have upcoming dates: sort soonest first
    if (aNext && bNext) return aNext.getTime() - bNext.getTime();
    // Only one has upcoming: it goes first
    if (aNext && !bNext) return -1;
    if (!aNext && bNext) return 1;
    // Neither has upcoming (both past): most recent first
    const aLast = a.dates[a.dates.length - 1]?.startDate;
    const bLast = b.dates[b.dates.length - 1]?.startDate;
    if (!aLast || !bLast) return 0;
    return bLast.getTime() - aLast.getTime();
  });

  // Paginate after sorting
  const paginatedItems = items.slice(offset, offset + limit);

  return { items: paginatedItems, total: actualTotal };
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
  occurrenceDate: Date,
): Promise<EventOccurrence | null> {
  const { start: startOfDay, end: endOfDay } = getDayBoundsInTimezone(
    getDateInTimezone(occurrenceDate),
  );

  const result = await db
    .select()
    .from(eventOccurrences)
    .where(
      and(
        eq(eventOccurrences.eventId, eventId),
        gte(eventOccurrences.occurrenceDate, startOfDay),
        lte(eventOccurrences.occurrenceDate, endOfDay),
      ),
    )
    .get();

  return result || null;
}

/**
 * Create or update an occurrence override
 */
export async function upsertOccurrenceOverride(
  eventId: number,
  occurrenceDate: Date,
  override: Partial<Omit<NewEventOccurrence, "eventId" | "occurrenceDate" | "createdAt">>,
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
  endDate: Date = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months default
): Date[] {
  if (!event.recurrenceRule) return [];

  const rule = parseRecurrenceRule(event.recurrenceRule);
  if (!rule) return [];

  const effectiveEnd =
    event.recurrenceEnd && event.recurrenceEnd < endDate ? event.recurrenceEnd : endDate;

  // Use recurrenceStart as the generation anchor, falling back to createdAt.
  // Generate from the series start so biweekly/monthly patterns stay consistent,
  // then filter to only return dates in the requested [startDate, effectiveEnd] window.
  const generationStart = event.recurrenceStart || event.createdAt;
  const allOccurrences = generateOccurrences(rule, generationStart, effectiveEnd);
  return allOccurrences.filter((d) => d >= startDate);
}

/**
 * Get event with all its occurrences (both from eventDates and generated from recurrence)
 */
export async function getEventWithOccurrences(
  eventId: number,
  rangeStart?: Date,
  rangeEnd: Date = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
): Promise<EventWithOccurrences | null> {
  const event = await getEventById(eventId);
  if (!event) return null;

  const effectiveRangeStart = rangeStart ?? siteDayBounds(new Date()).start;

  const occurrences: EventOccurrenceDisplay[] = [];

  // If this is a recurring event, generate occurrences
  if (event.recurrenceRule) {
    const generatedDates = getGeneratedOccurrences(event, effectiveRangeStart, rangeEnd);
    const overrides = await getEventOccurrenceOverrides(eventId);

    // Create a map of overrides by date (normalized to Newfoundland timezone date)
    const overrideMap = new Map<string, EventOccurrence>();
    for (const override of overrides) {
      const dateKey = getDateInTimezone(override.occurrenceDate);
      overrideMap.set(dateKey, override);
    }

    // Build occurrences from generated dates with any overrides applied
    for (const date of generatedDates) {
      // Get the date string in Newfoundland timezone for both the key and for parsing
      const dateStr = getDateInTimezone(date);
      const override = overrideMap.get(dateStr);

      // Calculate start and end times
      let startTime = event.defaultStartTime || "18:00";
      let endTime = event.defaultEndTime || null;

      if (override?.startTime) startTime = override.startTime;
      if (override?.endTime) endTime = override.endTime;

      // Parse time as Newfoundland timezone
      const startDateTime = parseAsTimezone(dateStr, startTime);

      let endDateTime: Date | null = null;
      if (endTime) {
        endDateTime = parseAsTimezone(dateStr, endTime);
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
  endDate: Date = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
): Promise<Array<EventOccurrenceDisplay & { event: Event }>> {
  // Get all events with recurrence rules
  const recurringEvents = await db
    .select()
    .from(events)
    .where(
      and(
        // Has a recurrence rule
        gte(events.recurrenceRule, ""),
      ),
    );

  // Filter to only those with actual rules
  const eventsWithRules = recurringEvents.filter((e) => e.recurrenceRule);

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
