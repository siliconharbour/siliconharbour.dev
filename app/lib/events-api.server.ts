/**
 * Shared mappers for the public /api/events endpoints.
 */
import type { events } from "~/db/schema";
import { parseRecurrenceRule, describeRecurrenceRule } from "./recurrence.server";

export interface EventRecurrence {
  /** Raw RRULE string, canonical machine-readable source of truth */
  rule: string;
  /** ISO timestamp when the series begins, or null if unbounded */
  start: string | null;
  /** ISO timestamp when the series ends, or null if unbounded */
  end: string | null;
  /** HH:mm in site timezone, or null if unset */
  defaultStartTime: string | null;
  /** HH:mm in site timezone, or null if unset */
  defaultEndTime: string | null;
  /** Human-readable English description, or null if the rule is unparseable */
  description: string | null;
}

/**
 * Build the API `recurrence` block for an event. Returns null for
 * non-recurring events. If the rule string is present but unparseable
 * we still expose the raw rule so consumers can attempt their own
 * parsing — only `description` is null in that case.
 */
export function eventRecurrence(event: typeof events.$inferSelect): EventRecurrence | null {
  if (!event.recurrenceRule) return null;
  const parsed = parseRecurrenceRule(event.recurrenceRule);
  return {
    rule: event.recurrenceRule,
    start: event.recurrenceStart?.toISOString() ?? null,
    end: event.recurrenceEnd?.toISOString() ?? null,
    defaultStartTime: event.defaultStartTime,
    defaultEndTime: event.defaultEndTime,
    description: parsed ? describeRecurrenceRule(parsed) : null,
  };
}
