export interface CalendarEventData {
  id: number;
  slug: string;
  title: string;
  dates: string[];
  spans: Array<{ start: string; end: string }>;
  isRecurring: boolean;
  isPeriod: boolean;
}

export function layoutCalendarSpans(events: CalendarEventData[]) {
  const spans = events
    .flatMap((event) => event.spans.map((span) => ({ ...span, event })))
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.event.id - b.event.id,
    );
  const laneEnds: string[] = [];
  return spans.map((span) => {
    const available = laneEnds.findIndex((end) => end < span.start);
    const lane = available < 0 ? laneEnds.length : available;
    laneEnds[lane] = span.end;
    return { ...span, lane };
  });
}
