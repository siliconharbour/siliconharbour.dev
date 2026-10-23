import { z } from "zod";
import { defineOperation } from "../define";
import { ConflictError, NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { id } from "../fields";
import { occurrenceInput, occurrenceUpdateInput, eventOccurrenceOutput } from "../contracts/events";
import {
  upsertOccurrenceOverride,
  deleteOccurrenceOverride,
  getEventOccurrenceOverrides,
} from "~/lib/events.server";
import { parseAsTimezone } from "~/lib/timezone";
import { requireEvent } from "./events.server";
async function requireRecurring(id: number) {
  const event = await requireEvent(id);
  if (!event.recurrenceRule) throw new ConflictError("This event is not recurring");
}
function date(value: string) {
  return value.length === 10 ? parseAsTimezone(value, "12:00") : new Date(value);
}
export const eventOccurrenceOperations = {
  eventOccurrenceCancel: defineOperation({
    name: "eventOccurrenceCancel",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Cancel one occurrence of a recurring event.",
    description:
      "Set the cancellation override for the specified Newfoundland calendar day. Other occurrences are unchanged. Use eventOccurrenceUncancel to restore it.",
    input: occurrenceInput,
    output: eventOccurrenceOutput,
    examples: [{ title: "Cancel a day", input: { id: 1, date: "2026-11-01" } }],
    run: async (_ctx, input) => {
      await requireRecurring(input.id);
      return toPlain(
        await upsertOccurrenceOverride(input.id, date(input.date), { cancelled: true }),
      );
    },
  }),
  eventOccurrenceUncancel: defineOperation({
    name: "eventOccurrenceUncancel",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Restore a cancelled event occurrence.",
    description:
      "Set cancelled to false while preserving location, time, and description overrides for this day.",
    input: occurrenceInput,
    output: eventOccurrenceOutput,
    examples: [{ title: "Restore a day", input: { id: 1, date: "2026-11-01" } }],
    run: async (_ctx, input) => {
      await requireRecurring(input.id);
      return toPlain(
        await upsertOccurrenceOverride(input.id, date(input.date), { cancelled: false }),
      );
    },
  }),
  eventOccurrenceUpdate: defineOperation({
    name: "eventOccurrenceUpdate",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Change one recurring event occurrence.",
    description:
      "Patch the location, description, link, or HH:mm start/end times for one day in America/St_Johns. Null restores an inherited field. Use eventUpdate to change the whole series.",
    input: occurrenceUpdateInput,
    output: eventOccurrenceOutput,
    examples: [
      { title: "Move one occurrence", input: { id: 1, date: "2026-11-01", location: "Library" } },
    ],
    run: async (_ctx, { id, date: day, ...fields }) => {
      await requireRecurring(id);
      return toPlain(await upsertOccurrenceOverride(id, date(day), fields));
    },
  }),
  eventOccurrenceClearOverride: defineOperation({
    name: "eventOccurrenceClearOverride",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Remove an occurrence override.",
    description:
      "Remove only an override owned by this event. The day returns to the series schedule and defaults, including cancellation state.",
    input: z.object({ id: id(), overrideId: id() }).strict(),
    output: z.object({ cleared: z.literal(true) }).strict(),
    examples: [{ title: "Clear override", input: { id: 1, overrideId: 1 } }],
    run: async (_ctx, input) => {
      await requireEvent(input.id);
      if (!(await getEventOccurrenceOverrides(input.id)).some((row) => row.id === input.overrideId))
        throw new NotFoundError("Occurrence override not found");
      await deleteOccurrenceOverride(input.overrideId);
      return { cleared: true as const };
    },
  }),
};
