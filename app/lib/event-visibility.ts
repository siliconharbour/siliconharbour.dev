import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { events, type Event } from "~/db/schema";

export type EventVisibility = "public" | "all";

/** The single database-level definition of a publicly visible event. */
export const publiclyVisibleEvent = or(
  isNull(events.importStatus),
  eq(events.importStatus, "published"),
)!;

export function isEventPublic(event: Pick<Event, "importStatus">): boolean {
  return event.importStatus === null || event.importStatus === "published";
}

/** Adds the public boundary unless an authenticated admin explicitly requested all events. */
export function withEventVisibility(condition: SQL, visibility: EventVisibility = "public"): SQL {
  return visibility === "all" ? condition : and(condition, publiclyVisibleEvent)!;
}
