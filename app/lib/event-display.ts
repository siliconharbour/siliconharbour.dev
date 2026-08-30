import type { EventDate, EventTimeMode } from "~/db/schema";
import { getEventTimingState } from "~/lib/event-timing";
import { formatInTimezone } from "~/lib/timezone";

type TimedEvent = { timeMode: EventTimeMode; dates: EventDate[] };

export function formatEventPeriodRange(date: EventDate): string | null {
  if (!date.endDate) return null;
  return `${formatInTimezone(date.startDate, "MMM d")} - ${formatInTimezone(date.endDate, "MMM d, yyyy")}`;
}

export function getEventStatusLabel(event: TimedEvent): string | null {
  const state = getEventTimingState(event.dates);
  if (state === "earlier-today") return "Earlier today";
  if (event.timeMode !== "period") return null;
  return state === "active" ? "Happening now" : "Time period";
}

export function isActivePeriod(event: TimedEvent): boolean {
  return event.timeMode === "period" && getEventTimingState(event.dates) === "active";
}
