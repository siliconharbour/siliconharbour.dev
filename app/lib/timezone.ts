import { format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

// All events on siliconharbour.dev are in Newfoundland timezone
export const SITE_TIMEZONE = "America/St_Johns";

/**
 * Format a date for display in Newfoundland timezone.
 * Use this instead of date-fns format() for consistent timezone display.
 */
export function formatInTimezone(date: Date, formatStr: string): string {
  const zonedDate = toZonedTime(date, SITE_TIMEZONE);
  return format(zonedDate, formatStr);
}

/**
 * Parse a date string and time as Newfoundland timezone.
 * Use this when saving event dates from forms.
 * 
 * @param dateStr - Date in yyyy-MM-dd format
 * @param timeStr - Time in HH:mm format
 * @returns Date object representing that time in Newfoundland timezone
 */
export function parseAsTimezone(dateStr: string, timeStr: string): Date {
  // Create a date string that will be interpreted as the site timezone
  const dateTimeStr = `${dateStr}T${timeStr}:00`;
  return fromZonedTime(dateTimeStr, SITE_TIMEZONE);
}

/**
 * Get time string (HH:mm) from a Date in Newfoundland timezone.
 * Use this when populating form fields for editing.
 */
export function getTimeInTimezone(date: Date): string {
  return formatInTimezone(date, "HH:mm");
}

/**
 * Get date string (yyyy-MM-dd) from a Date in Newfoundland timezone.
 * Use this when populating form fields for editing.
 */
export function getDateInTimezone(date: Date): string {
  return formatInTimezone(date, "yyyy-MM-dd");
}
