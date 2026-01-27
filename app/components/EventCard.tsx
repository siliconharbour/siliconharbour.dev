import { Link } from "react-router";
import type { Event, EventDate } from "~/db/schema";
import { RichMarkdown, type ResolvedRef } from "./RichMarkdown";
import { formatInTimezone } from "~/lib/timezone";

type EventCardProps = {
  event: Event & { dates: EventDate[] };
  variant?: "featured" | "default";
  resolvedRefs?: Record<string, ResolvedRef>;
};

export function EventCard({ event, variant = "default", resolvedRefs }: EventCardProps) {
  const nextDate = event.dates[0];
  const hasMultipleDates = event.dates.length > 1;

  const isFeatured = variant === "featured";

  if (isFeatured) {
    return (
      <Link
        to={`/events/${event.slug}`}
        className={`group relative block ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all ${event.coverImage ? "pb-4" : ""}`}
      >
        {event.coverImage && (
          <div className="img-tint aspect-[3/1] relative overflow-hidden bg-harbour-100">
            <img
              src={`/images/${event.coverImage}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
            />
          </div>
        )}

        {/* Overlapping content card */}
        <div
          className={`relative bg-white p-4 ${event.coverImage ? "-mt-10 mx-4 ring-1 ring-harbour-200/50" : ""}`}
        >
          <div className="flex items-start gap-3">
            {event.iconImage && (
              <div className="img-tint relative w-16 h-16 flex-shrink-0">
                <img
                  src={`/images/${event.iconImage}`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg leading-tight text-harbour-700 group-hover:text-harbour-600">
                  {event.title}
                </h3>
                {event.recurrenceRule && (
                  <span className="px-1.5 py-0.5 bg-harbour-100 text-harbour-600 text-xs shrink-0">
                    Recurring
                  </span>
                )}
              </div>
              {event.organizer && <p className="text-sm text-harbour-400">{event.organizer}</p>}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-col gap-1 text-sm text-harbour-500">
              {nextDate && (
                <div className="flex items-center gap-2">
                  <time dateTime={nextDate.startDate.toISOString()}>
                    {formatInTimezone(nextDate.startDate, "EEE, MMM d 'at' h:mm a")}
                  </time>
                  {nextDate.endDate && (
                    <>
                      <span className="text-harbour-300">-</span>
                      <time dateTime={nextDate.endDate.toISOString()}>
                        {formatInTimezone(nextDate.endDate, "h:mm a")}
                      </time>
                    </>
                  )}
                </div>
              )}
              {hasMultipleDates && (
                <p className="text-xs text-harbour-400">
                  +{event.dates.length - 1} more date{event.dates.length > 2 ? "s" : ""}
                </p>
              )}
            </div>

            {event.location && (
              <p className="text-sm text-harbour-400 truncate">{event.location}</p>
            )}

            <div className="text-sm text-harbour-500 line-clamp-3">
              <RichMarkdown
                content={event.description}
                resolvedRefs={resolvedRefs}
                className="prose-harbour"
              />
            </div>

            <span className="inline-flex items-center gap-1 text-sm font-medium text-harbour-600 group-hover:text-harbour-700 transition-colors">
              View Event
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </span>
          </div>
        </div>
      </Link>
    );
  }

  // Default (non-featured) card
  return (
    <Link
      to={`/events/${event.slug}`}
      className={`group relative block ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all ${event.coverImage ? "pb-3" : ""}`}
    >
      {event.coverImage && (
        <div className="img-tint aspect-[3/1] relative overflow-hidden bg-harbour-100">
          <img
            src={`/images/${event.coverImage}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}

      {/* Overlapping content card */}
      <div
        className={`relative bg-white p-4 ${event.coverImage ? "-mt-8 mx-3 ring-1 ring-harbour-200/50" : ""}`}
      >
        <div className="flex items-start gap-3">
          {event.iconImage && (
            <div className="img-tint relative w-14 h-14 flex-shrink-0">
              <img
                src={`/images/${event.iconImage}`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base leading-tight text-harbour-700 group-hover:text-harbour-600">
                {event.title}
              </h3>
              {event.recurrenceRule && (
                <span className="px-1.5 py-0.5 bg-harbour-100 text-harbour-600 text-xs shrink-0">
                  Recurring
                </span>
              )}
            </div>
            {event.organizer && <p className="text-sm text-harbour-400">{event.organizer}</p>}
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <div className="text-sm text-harbour-500">
            {nextDate && (
              <time dateTime={nextDate.startDate.toISOString()}>
                {formatInTimezone(nextDate.startDate, "EEE, MMM d 'at' h:mm a")}
              </time>
            )}
            {hasMultipleDates && (
              <span className="text-xs text-harbour-400 ml-2">+{event.dates.length - 1} more</span>
            )}
          </div>

          {event.location && <p className="text-sm text-harbour-400 truncate">{event.location}</p>}
        </div>
      </div>
    </Link>
  );
}
