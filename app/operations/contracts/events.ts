import { createOptions } from "../fields";
import { listInput } from "../listing";
import { z } from "zod";
import { eventTimeModes, eventTagColors, eventSourceTypes, fetchStatuses } from "../fields";
export const eventStatus = z.enum(["pending_review", "approved", "published", "hidden", "removed"]);
export const eventRowOutput = z
  .object({
    id: z.number(),
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    location: z.string().nullable(),
    link: z.string(),
    organizer: z.string().nullable(),
    coverImage: z.string().nullable(),
    iconImage: z.string().nullable(),
    coverImageUrl: z.string().nullable(),
    requiresSignup: z.boolean(),
    timeMode: z.enum(eventTimeModes),
    parentEventId: z.number().nullable(),
    recurrenceRule: z.string().nullable(),
    recurrenceStart: z.iso.datetime().nullable(),
    recurrenceEnd: z.iso.datetime().nullable(),
    defaultStartTime: z.string().nullable(),
    defaultEndTime: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    importSourceId: z.number().nullable(),
    externalId: z.string().nullable(),
    importStatus: eventStatus.nullable(),
    firstSeenAt: z.iso.datetime().nullable(),
    lastSeenAt: z.iso.datetime().nullable(),
  })
  .strict();
export const eventDateOutput = z
  .object({
    id: z.number(),
    eventId: z.number(),
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime().nullable(),
    isAllDay: z.boolean(),
  })
  .strict();
export const eventTagOutput = z
  .object({
    id: z.number(),
    name: z.string(),
    slug: z.string(),
    color: z.enum(eventTagColors),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const eventOccurrenceOutput = z
  .object({
    id: z.number(),
    eventId: z.number(),
    occurrenceDate: z.iso.datetime(),
    location: z.string().nullable(),
    description: z.string().nullable(),
    link: z.string().nullable(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    cancelled: z.boolean().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const eventSourceOutput = z
  .object({
    id: z.number(),
    name: z.string(),
    organizer: z.string().nullable(),
    sourceType: z.enum(eventSourceTypes),
    sourceIdentifier: z.string(),
    sourceUrl: z.string(),
    lastFetchedAt: z.iso.datetime().nullable(),
    fetchStatus: z.enum(fetchStatuses),
    fetchError: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const eventOutput = eventRowOutput
  .extend({ dates: z.array(eventDateOutput), tags: z.array(eventTagOutput).optional() })
  .strict();

import {
  text,
  nullableText,
  nullableUrl,
  imageInput,
  updateContract,
  id,
  confirm,
} from "../fields";
const calendarDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
export const eventDateInput = z
  .object({
    startDate: calendarDate.describe(
      "ISO timestamp, or YYYY-MM-DD in America/St_Johns with startTime.",
    ),
    endDate: calendarDate.nullable().optional(),
    startTime: clockTime.optional(),
    endTime: clockTime.optional(),
    isAllDay: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.isAllDay && value.startDate.length === 10 && !value.startTime)
      ctx.addIssue({
        code: "custom",
        path: ["startTime"],
        message: "A timed date requires startTime",
      });
    if (!value.isAllDay && value.endDate?.length === 10 && !value.endTime)
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "A timed end date requires endTime",
      });
  });
export const eventFields = {
  title: text("title", 500),
  description: text("description"),
  link: nullableUrl().pipe(z.string().min(1, "link is required")),
  location: nullableText().optional(),
  organizer: nullableText().optional(),
  requiresSignup: z.boolean().optional(),
  timeMode: z.enum(eventTimeModes).optional(),
  parentEventId: id().nullable().optional(),
  iconImage: imageInput.optional(),
  coverImage: imageInput.optional(),
  coverImageUrl: nullableUrl().optional(),
  importStatus: eventStatus.nullable().optional(),
  dates: z.array(eventDateInput).min(1).max(500).optional(),
  tagIds: z.array(id()).max(100).optional(),
  eventTags: z.array(text("tag slug", 200)).max(100).optional(),
  recurrenceRule: text("recurrenceRule", 1000).optional(),
  recurrenceStart: calendarDate.nullable().optional(),
  recurrenceEnd: calendarDate.nullable().optional(),
  defaultStartTime: clockTime.nullable().optional(),
  defaultEndTime: clockTime.nullable().optional(),
};
function validateSchedule(input: Record<string, unknown>, ctx: z.RefinementCtx) {
  if (input.tagIds !== undefined && input.eventTags !== undefined)
    ctx.addIssue({ code: "custom", message: "Supply tagIds or eventTags, not both" });
  const recurrence = [
    "recurrenceRule",
    "recurrenceStart",
    "recurrenceEnd",
    "defaultStartTime",
    "defaultEndTime",
  ];
  if (input.dates !== undefined && recurrence.some((key) => input[key] !== undefined))
    ctx.addIssue({ code: "custom", message: "Supply dates or recurrence fields, not both" });
  if (input.recurrenceRule && !input.defaultStartTime)
    ctx.addIssue({
      code: "custom",
      path: ["defaultStartTime"],
      message: "Recurring events require defaultStartTime",
    });
}
export const eventCreateInput = z
  .object(eventFields)
  .strict()
  .superRefine((input, ctx) => {
    validateSchedule(input, ctx);
    if (!input.dates && !input.recurrenceRule)
      ctx.addIssue({ code: "custom", message: "Supply dates or a recurrence rule" });
  })
  .safeExtend(createOptions);
export const eventUpdateInput = updateContract(z.object(eventFields).partial().shape).superRefine(
  validateSchedule,
);
export const eventListInput = listInput(["createdAt", "updatedAt", "title"])
  .extend({
    importStatus: eventStatus.nullable().optional(),
    sourceId: id().nullable().optional(),
  })
  .strict();
export const occurrenceInput = z
  .object({
    id: id(),
    date: calendarDate.describe("Calendar day of the occurrence in America/St_Johns."),
  })
  .strict();
export const occurrenceUpdateInput = occurrenceInput
  .extend({
    location: nullableText().optional(),
    description: nullableText().optional(),
    link: nullableUrl().optional(),
    startTime: clockTime.nullable().optional(),
    endTime: clockTime.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!Object.keys(value).some((key) => key !== "id" && key !== "date"))
      ctx.addIssue({ code: "custom", message: "No fields to update" });
  });
export const eventSourceFields = {
  name: text("name", 300),
  organizer: nullableText().optional(),
  sourceType: z.enum(eventSourceTypes),
  sourceIdentifier: text("sourceIdentifier", 1000),
  sourceUrl: nullableUrl().pipe(z.string()),
};
export const eventSourceCreateInput = z
  .object({ ...eventSourceFields, confirm })
  .strict()
  .safeExtend(createOptions);
export const eventSourceUpdateInput = updateContract(
  z.object(eventSourceFields).omit({ sourceType: true }).partial().shape,
);
export const eventSyncInput = z
  .object({ id: id(), confirm, async: z.boolean().default(false) })
  .strict();
export const eventSyncAllInput = z.object({ confirm, async: z.boolean().default(false) }).strict();
export const eventSyncOutput = z
  .object({
    success: z.boolean(),
    added: z.number(),
    skipped: z.number(),
    removed: z.number(),
    error: z.string().optional(),
    rateLimited: z.boolean().optional(),
  })
  .strict();
export const eventTagSaveInput = z
  .object({ id: id().optional(), name: text("name", 200), color: z.enum(eventTagColors) })
  .strict();

export const occurrenceDisplayOutput = z
  .object({
    eventId: z.number(),
    date: z.iso.datetime(),
    endDate: z.iso.datetime().nullable(),
    location: z.string().nullable(),
    description: z.string().nullable(),
    link: z.string().nullable(),
    cancelled: z.boolean(),
    isGenerated: z.boolean(),
    overrideId: z.number().optional(),
  })
  .strict();
