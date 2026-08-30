import { asc, eq } from "drizzle-orm";
import { db } from "~/db";
import { events, type Event, type EventTimeMode } from "~/db/schema";

type EventStructure = {
  eventId?: number;
  currentTimeMode?: EventTimeMode;
  nextTimeMode: EventTimeMode;
  parentEventId: number | null;
};

export async function assertValidEventStructure({
  eventId,
  currentTimeMode,
  nextTimeMode,
  parentEventId,
}: EventStructure): Promise<void> {
  if (parentEventId === eventId) throw new Error("An event cannot be part of itself.");
  if (nextTimeMode === "period" && parentEventId) {
    throw new Error("A time period cannot be part of another event.");
  }

  if (parentEventId) {
    const parent = await db.select().from(events).where(eq(events.id, parentEventId)).get();
    if (!parent) throw new Error("The selected time period does not exist.");
    if (parent.timeMode !== "period") {
      throw new Error("An event can only be part of a time period.");
    }
  }

  if (eventId && currentTimeMode === "period" && nextTimeMode !== "period") {
    const child = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.parentEventId, eventId))
      .limit(1)
      .get();
    if (child) throw new Error("Move the linked events before changing this time period.");
  }
}

export async function getPeriodOptions(
  excludeId?: number,
): Promise<Array<Pick<Event, "id" | "title">>> {
  const rows = await db
    .select({ id: events.id, title: events.title })
    .from(events)
    .where(eq(events.timeMode, "period"))
    .orderBy(asc(events.title));
  return rows.filter((event) => event.id !== excludeId);
}
