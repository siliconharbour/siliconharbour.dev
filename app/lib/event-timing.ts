import { endOfDay, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { EventDate, EventTimeMode } from "~/db/schema";
import { SITE_TIMEZONE } from "~/lib/timezone";

export type EventTimingState = "upcoming" | "active" | "earlier-today" | "past";

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
