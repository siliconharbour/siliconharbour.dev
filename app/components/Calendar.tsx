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
