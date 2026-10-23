import { page } from "../listing";
import { listEvents } from "~/lib/content-lists.server";
import { getEventTagIdsBySlugs } from "~/lib/event-tags.server";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError, InvalidOperationError } from "../errors";
import { toPlain } from "../plain";
import { lookupInput, idInput, deleteInput } from "../fields";
import {
  eventCreateInput,
  eventUpdateInput,
  eventListInput,
  eventOutput,
} from "../contracts/events";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEventById,
  getAllEvents,
  getEventOccurrenceOverrides,
} from "~/lib/events.server";
import { withEntityImages } from "~/lib/entity-images.server";
import { parseAsTimezone, getDateInTimezone } from "~/lib/timezone";
import { parseRecurrenceRule } from "~/lib/recurrence.server";
import {
  publishImportedEvent,
  hideImportedEvent,
  unhideImportedEvent,
  approveImportedEventWithCover,
} from "~/lib/event-importers/sync.server";
import { eventOccurrenceOutput } from "../contracts/events";

type Schedule = z.output<typeof eventUpdateInput>;
function eventDate(value: string, time?: string, allDay = false) {
  if (value.length === 10) return parseAsTimezone(value, allDay ? "12:00" : time!);
  return allDay ? parseAsTimezone(getDateInTimezone(new Date(value)), "12:00") : new Date(value);
}
function schedule(
  input: Omit<Schedule, "id" | "iconImage" | "coverImage" | "tagIds" | "eventTags">,
) {
  const { dates, recurrenceStart, recurrenceEnd, ...fields } = input;
  if (fields.recurrenceRule && !parseRecurrenceRule(fields.recurrenceRule))
    throw new InvalidOperationError("Unsupported recurrence rule");
  const recurrence = {
    ...(recurrenceStart !== undefined && {
      recurrenceStart: recurrenceStart ? eventDate(recurrenceStart, "12:00") : null,
    }),
    ...(recurrenceEnd !== undefined && {
      recurrenceEnd: recurrenceEnd ? eventDate(recurrenceEnd, "12:00") : null,
    }),
  };
  if (dates)
    return {
      fields: {
        ...fields,
        recurrenceRule: null,
        recurrenceStart: null,
        recurrenceEnd: null,
        defaultStartTime: null,
        defaultEndTime: null,
      },
      dates: dates.map((d) => ({
        startDate: eventDate(d.startDate, d.startTime, d.isAllDay),
        endDate: d.endDate ? eventDate(d.endDate, d.endTime, d.isAllDay) : null,
        isAllDay: d.isAllDay,
      })),
    };
  return { fields: { ...fields, ...recurrence }, dates: fields.recurrenceRule ? [] : undefined };
}
async function requireEvent(id: number) {
  const event = await getEventById(id);
  if (!event) throw new NotFoundError("Event not found");
  return event;
}
export { requireEvent };
export const eventOperations = {
  eventList: defineOperation({
    name: "eventList",
    area: "events",
    risk: "read",
    access: "admin",
    summary: "List events including unpublished records.",
    description:
      "Filter by title, import status, or source and return a bounded page with dates and tags. Use eventGet for recurrence overrides.",
    input: eventListInput,
    output: page(eventOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(await listEvents(input)),
  }),
  eventGet: defineOperation({
    name: "eventGet",
    area: "events",
    risk: "read",
    access: "admin",
    summary: "Get an event and its occurrence overrides.",
    description:
      "Look up an event by ID, slug, or exact title. Includes unpublished records, dates, tags, recurrence fields, and overrides.",
    input: lookupInput,
    output: eventOutput.extend({ overrides: z.array(eventOccurrenceOutput) }).strict(),
    examples: [{ title: "By ID", input: { id: 1 } }],
    run: async (_ctx, input) => {
      const event = input.id
        ? await getEventById(input.id)
        : (await getAllEvents()).find((e) =>
            input.slug
              ? e.slug === input.slug
              : e.title.toLowerCase() === input.name?.toLowerCase(),
          );
      if (!event) throw new NotFoundError("Event not found");
      return toPlain({ ...event, overrides: await getEventOccurrenceOverrides(event.id) });
    },
  }),
  eventCreate: defineOperation({
    name: "eventCreate",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Create an event with dates or recurrence.",
    description:
      "Supply explicit dates or a recurrence rule with defaultStartTime. All-day dates anchor to noon in America/St_Johns. Defaults to pending_review; importStatus null or published makes it public. Images are prepared before saving, and references and tags are synchronized.",
    input: eventCreateInput,
    output: eventOutput,
    examples: [
      {
        title: "One-time event",
        input: {
          title: "Meetup",
          description: "Community meetup",
          link: "https://example.com",
          dates: [{ startDate: "2026-11-01", isAllDay: true }],
        },
      },
    ],
    run: async (_ctx, input) => {
      const { iconImage, coverImage, tagIds, eventTags, ...rest } = input;
      const prepared = schedule(rest);
      const resolvedTags =
        eventTags === undefined ? tagIds : await getEventTagIdsBySlugs(eventTags);
      return toPlain(
        await withEntityImages(
          { type: "event" },
          { icon: iconImage, cover: coverImage },
          (images) =>
            createEvent(
              {
                ...prepared.fields,
                title: input.title,
                description: input.description,
                link: input.link,
                importStatus:
                  input.importStatus === undefined ? "pending_review" : input.importStatus,
                ...images,
              },
              prepared.dates ?? [],
              resolvedTags,
            ),
        ),
      );
    },
  }),
  eventUpdate: defineOperation({
    name: "eventUpdate",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Update event details or switch its schedule.",
    description:
      "Patch supplied fields. Supplying dates clears all five recurrence fields; supplying a recurrence rule clears explicit dates. Do not combine dates and recurrence fields. Stored occurrence overrides survive schedule changes and are ignored while one-time. Use eventOccurrenceUpdate to edit one occurrence. Images, slugs, tags, and references follow the shared service.",
    input: eventUpdateInput,
    output: eventOutput,
    examples: [{ title: "Rename", input: { id: 1, title: "Renamed meetup" } }],
    run: async (_ctx, input) => {
      const { id, iconImage, coverImage, tagIds, eventTags, ...rest } = input;
      await requireEvent(id);
      const prepared = schedule(rest);
      const resolvedTags =
        eventTags === undefined ? tagIds : await getEventTagIdsBySlugs(eventTags);
      return toPlain(
        (await withEntityImages(
          { type: "event", id },
          { icon: iconImage, cover: coverImage },
          (images) =>
            updateEvent(id, { ...prepared.fields, ...images }, prepared.dates, resolvedTags),
        ))!,
      );
    },
  }),
  eventDelete: defineOperation({
    name: "eventDelete",
    area: "events",
    risk: "destructive",
    access: "admin",
    summary: "Delete an event.",
    description:
      "Remove the event, dates, occurrence overrides and tag assignments; clean up unreferenced images. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true), record: eventOutput }).strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => {
      const record = await requireEvent(id);
      await deleteEvent(id);
      return { deleted: true as const, record: toPlain(record) };
    },
  }),
  eventPublish: defineOperation({
    name: "eventPublish",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Publish an event.",
    description:
      "Set importStatus to published so the event appears publicly. Approval alone does not publish.",
    input: idInput,
    output: eventOutput,
    examples: [{ title: "Publish", input: { id: 1 } }],
    run: async (_ctx, { id }) => {
      await requireEvent(id);
      await publishImportedEvent(id);
      return toPlain(await requireEvent(id));
    },
  }),
  eventImportApprove: defineOperation({
    name: "eventImportApprove",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Approve an imported event for editing.",
    description:
      "Set importStatus to approved. This does not publish; call eventPublish. If no cover exists, fetch the stored coverImageUrl through the public-address image guard. Download failure does not block approval; coverPulled reports the outcome.",
    input: idInput,
    output: z.object({ approved: z.literal(true), coverPulled: z.boolean() }).strict(),
    examples: [{ title: "Approve", input: { id: 1 } }],
    run: async (_ctx, { id }) => {
      await requireEvent(id);
      const result = await approveImportedEventWithCover(id);
      return { approved: true as const, coverPulled: result.coverPulled };
    },
  }),
  eventImportHide: defineOperation({
    name: "eventImportHide",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Hide an event.",
    description:
      "Unpublish a public or imported event by setting importStatus to hidden, preserving dates, recurrence, images and overrides. Use eventImportUnhide to return it to review, or eventPublish to publish.",
    input: idInput,
    output: eventOutput,
    examples: [{ title: "Hide", input: { id: 1 } }],
    run: async (_ctx, { id }) => {
      await requireEvent(id);
      await hideImportedEvent(id);
      return toPlain(await requireEvent(id));
    },
  }),
  eventImportUnhide: defineOperation({
    name: "eventImportUnhide",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Return a hidden imported event to review.",
    description:
      "Set importStatus to pending_review. It remains hidden from the public until eventPublish.",
    input: idInput,
    output: eventOutput,
    examples: [{ title: "Review again", input: { id: 1 } }],
    run: async (_ctx, { id }) => {
      await requireEvent(id);
      await unhideImportedEvent(id);
      return toPlain(await requireEvent(id));
    },
  }),
};
