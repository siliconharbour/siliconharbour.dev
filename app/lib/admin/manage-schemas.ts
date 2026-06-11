import { z } from "zod";
import {
  parseFormData,
  zCheckboxBoolean,
  zOptionalNullableString,
  zRequiredString,
} from "~/lib/admin/form";
import { parseAsTimezone } from "~/lib/timezone";

export const companyFormSchema = z.object({
  name: zRequiredString("Name"),
  description: zRequiredString("Description"),
  website: zOptionalNullableString,
  wikipedia: zOptionalNullableString,
  linkedin: zOptionalNullableString,
  github: zOptionalNullableString,
  location: zOptionalNullableString,
  founded: zOptionalNullableString,
  technl: zCheckboxBoolean,
  genesis: zCheckboxBoolean,
});

export const eventBaseSchema = z.object({
  title: zRequiredString("Title"),
  description: zRequiredString("Description"),
  link: zRequiredString("Link"),
  location: zOptionalNullableString,
  organizer: zOptionalNullableString,
  eventType: z.enum(["onetime", "recurring"]),
  requiresSignup: zCheckboxBoolean,
});

export const eventRecurringSchema = z.object({
  recurrenceRule: zRequiredString("Recurrence pattern"),
  recurrenceStart: zOptionalNullableString,
  defaultStartTime: zRequiredString("Default start time"),
  defaultEndTime: zOptionalNullableString,
  recurrenceEnd: zOptionalNullableString,
});

export function parseCompanyForm(formData: FormData) {
  return parseFormData(formData, companyFormSchema);
}

export function parseEventBaseForm(formData: FormData) {
  return parseFormData(formData, eventBaseSchema);
}

export function parseEventRecurringForm(formData: FormData) {
  return parseFormData(formData, eventRecurringSchema);
}

export function parseOneTimeEventDates(formData: FormData):
  | {
      success: true;
      data: { startDate: Date; endDate: Date | null; isAllDay: boolean }[];
    }
  | {
      success: false;
      error: string;
    } {
  const dates: { startDate: Date; endDate: Date | null; isAllDay: boolean }[] = [];
  let dateIndex = 0;

  // All-day rows anchor the timestamp to noon site-time so a calendar
  // day ("Jul 15") stays "Jul 15" regardless of the viewer's tz offset.
  const NOON = "12:00";

  while (formData.has(`dates[${dateIndex}][startDate]`)) {
    const startDateStr = formData.get(`dates[${dateIndex}][startDate]`);
    const startTime = formData.get(`dates[${dateIndex}][startTime]`);
    const hasEnd = formData.get(`dates[${dateIndex}][hasEnd]`) === "1";
    const isAllDay = formData.get(`dates[${dateIndex}][isAllDay]`) === "1";

    if (typeof startDateStr !== "string") {
      return { success: false, error: "Each date requires a valid start date" };
    }
    if (!isAllDay && (typeof startTime !== "string" || startTime === "")) {
      return {
        success: false,
        error: "Each timed date requires a start time. Tick 'All day' if no specific time.",
      };
    }

    const startDate = parseAsTimezone(startDateStr, isAllDay ? NOON : (startTime as string));
    let endDate: Date | null = null;

    if (hasEnd) {
      const endDateStr = formData.get(`dates[${dateIndex}][endDate]`);
      const endTime = formData.get(`dates[${dateIndex}][endTime]`);
      if (typeof endDateStr === "string" && endDateStr) {
        if (isAllDay) {
          // All-day range: any end-day works, end-time is ignored.
          endDate = parseAsTimezone(endDateStr, NOON);
        } else if (typeof endTime === "string" && endTime) {
          endDate = parseAsTimezone(endDateStr, endTime);
        }
      }
    }

    dates.push({ startDate, endDate, isAllDay });
    dateIndex++;
  }

  if (dates.length === 0) {
    return { success: false, error: "At least one date is required for one-time events" };
  }

  return { success: true, data: dates };
}
