import { describe, expect, it } from "vitest";
import { labelRecurringEventsWithSiteTimezone } from "~/routes/calendar-ics";

describe("calendar ICS timezone", () => {
  it("labels recurring wall times with the Newfoundland timezone", () => {
    const calendar = [
      "BEGIN:VEVENT",
      "DTSTART:20260305T180000",
      "DTEND:20260305T190000",
      "RRULE:FREQ=WEEKLY;BYDAY=TH",
      "END:VEVENT",
    ].join("\r\n");

    expect(labelRecurringEventsWithSiteTimezone(calendar)).toContain(
      "DTSTART;TZID=America/St_Johns:20260305T180000",
    );
    expect(labelRecurringEventsWithSiteTimezone(calendar)).toContain(
      "DTEND;TZID=America/St_Johns:20260305T190000",
    );
  });

  it("leaves one-time UTC events unchanged", () => {
    const calendar = [
      "BEGIN:VEVENT",
      "DTSTART:20260305T213000Z",
      "DTEND:20260305T223000Z",
      "END:VEVENT",
    ].join("\r\n");

    expect(labelRecurringEventsWithSiteTimezone(calendar)).toBe(calendar);
  });
});
