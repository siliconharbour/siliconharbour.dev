import { Link } from "react-router";
import type { Event, EventDate } from "~/db/schema";
import { formatInTimezone } from "~/lib/timezone";

type EventCardProps = {
  event: Event & { dates: EventDate[] };
  variant?: "featured" | "default";
};

export function EventCard({ event, variant = "default" }: EventCardProps) {
  const nextDate = event.dates[0];
  const hasMultipleDates = event.dates.length > 1;

  const isFeatured = variant === "featured";

  if (isFeatured) {
    return (
      <Link
        to={`/events/${event.slug}`}
        className={`group relative block ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all ${event.coverImage ? "pb-3" : ""}`}
      >
        {event.coverImage && (
          <div className="img-tint aspect-[4/1] relative overflow-hidden bg-harbour-100">
            <img
              src={`/images/${event.coverImage}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
            />
          </div>
        )}

        {/* Overlapping content card */}
        <div
          className={`relative bg-white p-3 ${event.coverImage ? "-mt-8 mx-3 ring-1 ring-harbour-200/50" : ""}`}
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

          <div className="mt-2 flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-harbour-500">
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
                <span className="text-xs text-harbour-400">
                  +{event.dates.length - 1} more date{event.dates.length > 2 ? "s" : ""}
                </span>
              )}
              {event.location && (
                <span className="text-harbour-400 truncate">{event.location}</span>
              )}
            </div>
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
