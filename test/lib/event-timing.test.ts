import { describe, expect, it } from "vitest";
import { getEventTimingState, validatePeriodDates } from "~/lib/event-timing";
import { formatEventPeriodRange, getEventStatusLabel } from "~/lib/event-display";
import type { EventDate } from "~/db/schema";

function date(startDate: string, endDate: string | null = null): EventDate {
  return {
    id: 1,
    eventId: 1,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    isAllDay: false,
  };
}

describe("event timing", () => {
  it("keeps a finished event current through the rest of its Newfoundland day", () => {
    const dates = [date("2026-08-29T16:30:00Z", "2026-08-29T17:30:00Z")];
    expect(getEventTimingState(dates, new Date("2026-08-29T22:00:00Z"))).toBe("earlier-today");
  });

  it("moves an event to past at Newfoundland midnight", () => {
    const dates = [date("2026-08-29T16:30:00Z", "2026-08-29T17:30:00Z")];
    expect(getEventTimingState(dates, new Date("2026-08-30T03:00:00Z"))).toBe("past");
  });

  it("reports an in-progress period as active", () => {
    const dates = [date("2026-09-12T05:00:00Z", "2026-09-26T05:00:00Z")];
    expect(getEventTimingState(dates, new Date("2026-09-20T12:00:00Z"))).toBe("active");
  });
});

describe("period validation", () => {
  it("requires exactly one range with an end", () => {
    expect(validatePeriodDates("period", [{ startDate: new Date(), endDate: null }])).toMatch(
      /exactly one date range/i,
    );
    expect(
      validatePeriodDates("period", [
        { startDate: new Date(), endDate: new Date(Date.now() + 1_000) },
        { startDate: new Date(), endDate: new Date(Date.now() + 2_000) },
      ]),
    ).toMatch(/exactly one date range/i);
  });

  it("accepts an ordered period range", () => {
    expect(
      validatePeriodDates("period", [
        {
          startDate: new Date("2026-09-12T05:00:00Z"),
          endDate: new Date("2026-09-26T05:00:00Z"),
        },
      ]),
    ).toBeNull();
  });
});

describe("event display", () => {
  it("formats one shared period range for cards and feeds", () => {
    expect(formatEventPeriodRange(date("2026-09-12T14:30:00Z", "2026-09-26T14:30:00Z"))).toBe(
      "Sep 12 - Sep 26, 2026",
    );
  });

  it("does not add a redundant label to an upcoming period", () => {
    const dates = [date("2026-09-12T05:00:00Z", "2026-09-26T05:00:00Z")];
    expect(
      getEventStatusLabel({
        timeMode: "period",
        dates,
      }),
    ).toBeNull();
  });
});
