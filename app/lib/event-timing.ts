import { endOfDay, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { EventDate, EventTimeMode } from "~/db/schema";
import { SITE_TIMEZONE } from "~/lib/timezone";

export type EventTimingState = "upcoming" | "active" | "earlier-today" | "past";
export type EventFilter = "upcoming" | "past" | "all";

export function siteDayBounds(now: Date): { start: Date; end: Date } {
  const localNow = toZonedTime(now, SITE_TIMEZONE);
  return {
    start: fromZonedTime(startOfDay(localNow), SITE_TIMEZONE),
    end: fromZonedTime(endOfDay(localNow), SITE_TIMEZONE),
  };
}

export function getEventTimingState(dates: EventDate[], now = new Date()): EventTimingState {
  if (dates.length === 0) return "past";
  const { start: todayStart } = siteDayBounds(now);
  const firstStart = Math.min(...dates.map((date) => date.startDate.getTime()));
  const finalEnd = Math.max(...dates.map((date) => (date.endDate ?? date.startDate).getTime()));

  if (firstStart > now.getTime()) return "upcoming";
  if (finalEnd >= now.getTime()) return "active";
  if (finalEnd >= todayStart.getTime()) return "earlier-today";
  return "past";
}

/** True when a date has not ended before the current local calendar day. */
export function isCurrentOrUpcomingEventDate(date: EventDate, now: Date): boolean {
  const { start: todayStart } = siteDayBounds(now);
  return (date.endDate ?? date.startDate) >= todayStart;
}

/** Compare sorted date collections in the order expected by an event list filter. */
export function compareEventDateOrder(
  aDates: EventDate[],
  bDates: EventDate[],
  filter: EventFilter,
  now: Date,
): number {
  const aLast = aDates[aDates.length - 1]?.startDate;
  const bLast = bDates[bDates.length - 1]?.startDate;

  if (filter === "past") {
    if (!aLast || !bLast) return 0;
    return bLast.getTime() - aLast.getTime();
  }

  const aNext = aDates.find((date) => isCurrentOrUpcomingEventDate(date, now))?.startDate;
  const bNext = bDates.find((date) => isCurrentOrUpcomingEventDate(date, now))?.startDate;

  if (aNext && bNext) return aNext.getTime() - bNext.getTime();
  if (aNext) return -1;
  if (bNext) return 1;
  if (!aLast || !bLast) return 0;
  return bLast.getTime() - aLast.getTime();
}

export function validatePeriodDates(
  timeMode: EventTimeMode,
  dates: Array<{ startDate: Date; endDate?: Date | null }>,
): string | null {
  if (timeMode !== "period") return null;
  if (dates.length !== 1 || !dates[0]?.endDate) {
    return "A time period requires exactly one date range with an end date.";
  }
  if (dates[0].endDate < dates[0].startDate) {
    return "The period end must be after its start.";
  }
  return null;
}

export function normalizeEventDates<T extends { isAllDay?: boolean }>(
  timeMode: EventTimeMode,
  dates: T[],
): Array<T & { isAllDay: boolean }> {
  return dates.map((date) => ({
    ...date,
    isAllDay: timeMode === "period" ? true : (date.isAllDay ?? false),
  }));
}
