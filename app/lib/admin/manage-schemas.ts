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

export function parseOneTimeEventDates(
  formData: FormData,
): { success: true; data: { startDate: Date; endDate: Date | null }[] } | {
  success: false;
  error: string;
} {
  const dates: { startDate: Date; endDate: Date | null }[] = [];
  let dateIndex = 0;

  while (formData.has(`dates[${dateIndex}][startDate]`)) {
    const startDateStr = formData.get(`dates[${dateIndex}][startDate]`);
    const startTime = formData.get(`dates[${dateIndex}][startTime]`);
    const hasEnd = formData.get(`dates[${dateIndex}][hasEnd]`) === "1";

    if (typeof startDateStr !== "string" || typeof startTime !== "string") {
      return { success: false, error: "Each date requires a valid start date and start time" };
    }

    const startDate = parseAsTimezone(startDateStr, startTime);
    let endDate: Date | null = null;

    if (hasEnd) {
      const endDateStr = formData.get(`dates[${dateIndex}][endDate]`);
      const endTime = formData.get(`dates[${dateIndex}][endTime]`);
      if (typeof endDateStr === "string" && endDateStr && typeof endTime === "string" && endTime) {
        endDate = parseAsTimezone(endDateStr, endTime);
      }
    }

    dates.push({ startDate, endDate });
    dateIndex++;
  }

  if (dates.length === 0) {
    return { success: false, error: "At least one date is required for one-time events" };
  }

  return { success: true, data: dates };
}
