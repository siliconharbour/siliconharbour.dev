import { expect, it } from "vitest";
import { layoutCalendarSpans, type CalendarEventData } from "~/lib/calendar-layout";

function event(id: number, start: string, end: string): CalendarEventData {
  return {
    id,
    slug: `event-${id}`,
    title: `Event ${id}`,
    dates: [],
    spans: [{ start, end }],
    isRecurring: false,
    isPeriod: true,
  };
}

it("keeps overlapping spans on separate lanes and reuses a free lane after an event ends", () => {
  const spans = layoutCalendarSpans([
    event(3, "2026-10-21", "2026-10-25"),
    event(2, "2026-10-20", "2026-10-22"),
    event(1, "2026-10-18", "2026-10-20"),
  ]);
  expect(spans.map(({ event, lane }) => [event.id, lane])).toEqual([
    [1, 0],
    [2, 1],
    [3, 0],
  ]);
});

it("does not connect separate event dates or recurring occurrences", () => {
  const single = {
    ...event(1, "2026-10-20", "2026-10-21"),
    spans: [],
    dates: ["2026-10-20", "2026-10-21"],
  };
  expect(layoutCalendarSpans([single, { ...single, id: 2, isRecurring: true }])).toEqual([]);
});
