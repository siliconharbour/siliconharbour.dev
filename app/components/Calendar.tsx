import { useDatePicker } from "@rehookify/datepicker";
import { useState, useMemo } from "react";
import { format, isSameDay, addMonths, subMonths } from "date-fns";
import type { Event, EventDate } from "~/db/schema";

type CalendarProps = {
  events: (Event & { dates: EventDate[] })[];
  onDateClick?: (date: Date) => void;
};

export function Calendar({ events, onDateClick }: CalendarProps) {
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [offsetDate, setOffsetDate] = useState<Date>(new Date());

  const {
    data: { calendars, weekDays },
    propGetters: { dayButton },
  } = useDatePicker({
    selectedDates,
    onDatesChange: setSelectedDates,
    dates: { mode: "single" },
    offsetDate,
  });

  const { month, year, days } = calendars[0];

  const goToPreviousMonth = () => setOffsetDate((d) => subMonths(d, 1));
  const goToNextMonth = () => setOffsetDate((d) => addMonths(d, 1));

  // Create a map of dates that have events
  const eventDateMap = useMemo(() => {
    const map = new Map<string, (Event & { dates: EventDate[] })[]>();
    
    events.forEach((event) => {
      event.dates.forEach((eventDate) => {
        const dateKey = format(eventDate.startDate, "yyyy-MM-dd");
        const existing = map.get(dateKey) || [];
        if (!existing.find((e) => e.id === event.id)) {
          map.set(dateKey, [...existing, event]);
        }
      });
    });
    
    return map;
  }, [events]);

  const handleDayClick = (date: Date) => {
    onDateClick?.(date);
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
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Week days header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-harbour-400 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((dpDay) => {
          const dateKey = format(dpDay.$date, "yyyy-MM-dd");
          const dayEvents = eventDateMap.get(dateKey) || [];
          const hasEvents = dayEvents.length > 0;
          const isToday = isSameDay(dpDay.$date, new Date());

          return (
            <button
              key={dateKey}
              {...dayButton(dpDay)}
              onClick={() => handleDayClick(dpDay.$date)}
              className={`
                relative aspect-square flex flex-col items-center justify-start p-1 text-sm transition-colors
                ${dpDay.inCurrentMonth ? "text-harbour-700" : "text-harbour-200"}
                ${isToday ? "bg-harbour-50 font-semibold" : ""}
                ${hasEvents && dpDay.inCurrentMonth ? "hover:bg-harbour-50" : ""}
                ${!hasEvents ? "cursor-default" : "cursor-pointer"}
              `}
            >
              <span
                className={`
                  ${isToday ? "text-harbour-600" : ""}
                `}
              >
                {dpDay.day}
              </span>
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
            </button>
          );
        })}
      </div>
    </div>
  );
}
