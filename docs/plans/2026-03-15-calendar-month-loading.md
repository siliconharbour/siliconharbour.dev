# Calendar Month-Aware Event Loading

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the calendar sidebar fetch events for any month (past or future) when the user navigates, instead of only showing upcoming events from the initial page load.

**Architecture:** New `/api/calendar-events?month=YYYY-MM` endpoint returns a lean payload (id, slug, title, date strings) for a given month. The Calendar component fetches on month navigation and caches results. Initial render uses server-loaded data for the current month (no flash).

**Tech Stack:** React Router, Drizzle ORM/SQLite, `date-fns` for date math, native `fetch` for client-side API calls

---

### Task 1: Add `getEventsForMonth` server function

**Files:**
- Modify: `app/lib/events.server.ts`

**Step 1: Add the function**

Add this function after the existing `getUpcomingEvents` function (around line 280):

```typescript
/**
 * Calendar event data - minimal payload for rendering dots on a calendar
 */
export interface CalendarEventData {
  id: number;
  slug: string;
  title: string;
  dates: string[]; // Array of "YYYY-MM-DD" date strings within the month
}

/**
 * Get all events that have occurrences in a given month.
 * Returns a minimal payload for calendar dot rendering.
 */
export async function getEventsForMonth(
  year: number,
  month: number, // 1-indexed (1 = January)
): Promise<CalendarEventData[]> {
  // Build month boundaries in Newfoundland timezone
  const monthStart = parseAsTimezone(
    `${year}-${String(month).padStart(2, "0")}-01`,
    "00:00",
  );
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEnd = parseAsTimezone(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
    "00:00",
  );

  const result: CalendarEventData[] = [];
  const seenEventIds = new Set<number>();

  // 1. One-time events with dates in this month
  const oneTimeDates = await db
    .select()
    .from(eventDates)
    .where(and(gte(eventDates.startDate, monthStart), lte(eventDates.startDate, monthEnd)));

  // Group by event
  const eventDateMap = new Map<number, string[]>();
  for (const ed of oneTimeDates) {
    const dateStr = getDateInTimezone(ed.startDate);
    if (!eventDateMap.has(ed.eventId)) {
      eventDateMap.set(ed.eventId, []);
    }
    eventDateMap.get(ed.eventId)!.push(dateStr);
  }

  // Fetch event details for one-time events
  for (const [eventId, dateStrs] of eventDateMap) {
    const event = await db.select().from(events).where(eq(events.id, eventId)).get();
    if (event) {
      seenEventIds.add(eventId);
      result.push({
        id: event.id,
        slug: event.slug,
        title: event.title,
        dates: dateStrs,
      });
    }
  }

  // 2. Recurring events - generate occurrences for this month
  const recurringEventsResult = await db
    .select()
    .from(events)
    .where(gte(events.recurrenceRule, ""));

  const recurringEventsList = recurringEventsResult.filter((e) => e.recurrenceRule);

  for (const event of recurringEventsList) {
    if (seenEventIds.has(event.id)) continue;

    const generatedDates = getGeneratedOccurrences(event, monthStart, monthEnd);
    if (generatedDates.length === 0) continue;

    // Get overrides to check for cancellations
    const overrides = await getEventOccurrenceOverrides(event.id);
    const cancelledDates = new Set(
      overrides
        .filter((o) => o.cancelled)
        .map((o) => getDateInTimezone(o.occurrenceDate)),
    );

    const dateStrs = generatedDates
      .map((d) => getDateInTimezone(d))
      .filter((d) => !cancelledDates.has(d));

    if (dateStrs.length > 0) {
      result.push({
        id: event.id,
        slug: event.slug,
        title: event.title,
        dates: dateStrs,
      });
    }
  }

  return result;
}
```

Note: `eq` is already imported at the top of the file. The function uses `parseAsTimezone` and `getDateInTimezone` which are already imported.

**Step 2: Verify build**

Run: `pnpm run build`

**Step 3: Commit**

```
git add app/lib/events.server.ts
git commit -m "Add getEventsForMonth for calendar month queries"
```

---

### Task 2: Create the API endpoint

**Files:**
- Create: `app/routes/api/calendar-events.tsx`
- Modify: `app/routes.ts`

**Step 1: Create the API route**

Create `app/routes/api/calendar-events.tsx`:

```typescript
import type { Route } from "./+types/calendar-events";
import { getEventsForMonth } from "~/lib/events.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month"); // Expected: "YYYY-MM"

  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return Response.json(
      { error: "month parameter required in YYYY-MM format" },
      { status: 400 },
    );
  }

  const [yearStr, monthStr] = monthParam.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  if (month < 1 || month > 12) {
    return Response.json({ error: "Invalid month" }, { status: 400 });
  }

  const events = await getEventsForMonth(year, month);

  return Response.json(events, {
    headers: {
      "Cache-Control": "public, max-age=300", // 5 min cache
    },
  });
}
```

**Step 2: Register the route**

In `app/routes.ts`, add after the existing API routes (around line 79, after the technologies API routes):

```typescript
  route("api/calendar-events", "routes/api/calendar-events.tsx"),
```

**Step 3: Verify build**

Run: `pnpm run build`

**Step 4: Commit**

```
git add app/routes/api/calendar-events.tsx app/routes.ts
git commit -m "Add /api/calendar-events endpoint for month-based queries"
```

---

### Task 3: Update Calendar component to fetch on month navigation

**Files:**
- Modify: `app/components/Calendar.tsx`

**Step 1: Rewrite the Calendar component**

The Calendar needs to:
1. Accept initial event data from server (for current month - no flash)
2. On month navigation, fetch from `/api/calendar-events?month=YYYY-MM`
3. Cache fetched months in state
4. Build the event date map from the active month's data

Replace the entire `app/components/Calendar.tsx` with:

```typescript
import { useDatePicker } from "@rehookify/datepicker";
import { useState, useMemo, useEffect, useCallback } from "react";
import { isSameDay, addMonths, subMonths, format } from "date-fns";
import { useNavigate } from "react-router";
import type { Event, EventDate } from "~/db/schema";
import { formatInTimezone } from "~/lib/timezone";

/**
 * Minimal calendar event data returned from /api/calendar-events
 */
interface CalendarEventData {
  id: number;
  slug: string;
  title: string;
  dates: string[]; // "YYYY-MM-DD" strings
}

type CalendarProps = {
  events: (Event & { dates: EventDate[] })[];
  /** If true, clicking a date navigates to event(s). Default: true */
  navigateOnClick?: boolean;
  /** If true, always filter by date even for single events. Default: false */
  alwaysFilterByDate?: boolean;
  /** Custom handler for date clicks */
  onDateClick?: (date: Date, events: CalendarEventData[]) => void;
};

export function Calendar({
  events,
  navigateOnClick = true,
  alwaysFilterByDate = false,
  onDateClick,
}: CalendarProps) {
  const navigate = useNavigate();
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [offsetDate, setOffsetDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);

  // Cache: month key "YYYY-MM" -> CalendarEventData[]
  const [monthCache, setMonthCache] = useState<Record<string, CalendarEventData[]>>(() => {
    // Seed cache with initial server data for the current month
    const now = new Date();
    const currentMonthKey = format(now, "yyyy-MM");
    const initialData: CalendarEventData[] = events.map((event) => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      dates: event.dates.map((d) => {
        const startDate = d.startDate instanceof Date ? d.startDate : new Date(d.startDate);
        return formatInTimezone(startDate, "yyyy-MM-dd");
      }),
    }));
    return { [currentMonthKey]: initialData };
  });

  const currentMonthKey = format(offsetDate, "yyyy-MM");

  // Fetch month data when navigating
  const fetchMonth = useCallback(async (monthKey: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar-events?month=${monthKey}`);
      if (res.ok) {
        const data: CalendarEventData[] = await res.json();
        setMonthCache((prev) => ({ ...prev, [monthKey]: data }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!monthCache[currentMonthKey]) {
      fetchMonth(currentMonthKey);
    }
  }, [currentMonthKey, monthCache, fetchMonth]);

  const activeEvents = monthCache[currentMonthKey] || [];

  const {
    data: { calendars, weekDays },
  } = useDatePicker({
    selectedDates,
    onDatesChange: setSelectedDates,
    dates: { mode: "single" },
    offsetDate,
  });

  const { month, year, days } = calendars[0];

  const goToPreviousMonth = () => setOffsetDate((d) => subMonths(d, 1));
  const goToNextMonth = () => setOffsetDate((d) => addMonths(d, 1));

  // Build a map of dates -> events for the active month
  const eventDateMap = useMemo(() => {
    const map = new Map<string, CalendarEventData[]>();
    for (const event of activeEvents) {
      for (const dateStr of event.dates) {
        const existing = map.get(dateStr) || [];
        if (!existing.find((e) => e.id === event.id)) {
          map.set(dateStr, [...existing, event]);
        }
      }
    }
    return map;
  }, [activeEvents]);

  const handleDayClick = (date: Date) => {
    const dateKey = formatInTimezone(date, "yyyy-MM-dd");
    const dayEvents = eventDateMap.get(dateKey) || [];

    if (onDateClick) {
      onDateClick(date, dayEvents);
      return;
    }

    if (!navigateOnClick || dayEvents.length === 0) return;

    if (dayEvents.length === 1 && !alwaysFilterByDate) {
      navigate(`/events/${dayEvents[0].slug}`);
    } else {
      navigate(`/events?filter=all&date=${dateKey}`);
    }
  };

  return (
    <div className="bg-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-harbour-700">
          {month} {year}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={goToPreviousMonth}
            type="button"
            className="p-2 text-harbour-400 hover:text-harbour-600 transition-colors"
            aria-label="Previous month"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            onClick={goToNextMonth}
            type="button"
            className="p-2 text-harbour-400 hover:text-harbour-600 transition-colors"
            aria-label="Next month"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Week days header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-harbour-400 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className={`grid grid-cols-7 gap-1 ${loading ? "opacity-60" : ""} transition-opacity`}>
        {days.map((dpDay) => {
          const dateKey = formatInTimezone(dpDay.$date, "yyyy-MM-dd");
          const dayEvents = eventDateMap.get(dateKey) || [];
          const hasEvents = dayEvents.length > 0;
          const isToday = isSameDay(dpDay.$date, new Date());

          const isClickable = hasEvents && dpDay.inCurrentMonth;

          const dayClasses = `
            calendar-day relative aspect-square flex flex-col items-center justify-start p-1 text-sm transition-colors
            ${dpDay.inCurrentMonth ? (hasEvents ? "text-harbour-700" : "text-harbour-400") : "text-harbour-200"}
            ${isToday ? "bg-harbour-50 font-semibold" : ""}
            ${isClickable ? "hover:bg-harbour-50 cursor-pointer" : ""}
          `;

          const dayContent = (
            <>
              <span className={isToday ? "text-harbour-600" : ""}>{dpDay.day}</span>
              {hasEvents && dpDay.inCurrentMonth && (
                <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className="w-1.5 h-1.5 bg-harbour-500"
                      title={event.title}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-harbour-400">+{dayEvents.length - 3}</span>
                  )}
                </div>
              )}
            </>
          );

          return isClickable ? (
            <button
              key={dateKey}
              type="button"
              onClick={() => handleDayClick(dpDay.$date)}
              className={dayClasses}
            >
              {dayContent}
            </button>
          ) : (
            <div key={dateKey} className={dayClasses}>
              {dayContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Key changes from original:
- `CalendarEventData` type for the lean API payload
- `monthCache` state seeded with initial server data
- `fetchMonth` fetches from API and updates cache
- `useEffect` triggers fetch when navigating to an uncached month
- `loading` state fades dots during fetch (`opacity-60`)
- `eventDateMap` built from `activeEvents` (the current month's cached data)
- `onDateClick` type updated to use `CalendarEventData[]`

**Step 2: Verify build**

Run: `pnpm run build`

**Step 3: Commit**

```
git add app/components/Calendar.tsx
git commit -m "Calendar fetches events per month on navigation

- Seeds cache with server-loaded data for current month (no flash)
- Fetches /api/calendar-events?month=YYYY-MM on month navigation
- Caches fetched months so revisiting doesn't re-fetch
- Subtle opacity fade during loading"
```

---

### Task 4: Build and verify

**Step 1: Run lint**

Run: `pnpm run lint:fix`

**Step 2: Run build**

Run: `pnpm run build`

**Step 3: Fix any issues, re-run, commit if needed**
