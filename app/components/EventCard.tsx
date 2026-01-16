import { format } from "date-fns";
import type { Event, EventDate } from "~/db/schema";
import { RichMarkdown, type ResolvedRef } from "./RichMarkdown";

type EventCardProps = {
  event: Event & { dates: EventDate[] };
  variant?: "featured" | "default";
  resolvedRefs?: Record<string, ResolvedRef>;
};

export function EventCard({ event, variant = "default", resolvedRefs }: EventCardProps) {
  const nextDate = event.dates[0];
  const hasMultipleDates = event.dates.length > 1;

  const isFeatured = variant === "featured";

  return (
    <article
      className={`group relative overflow-hidden bg-white p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all ${
        isFeatured ? "flex flex-col md:flex-row md:p-0" : ""
      }`}
    >
      {event.coverImage && (
        <div
          className={`img-tint relative overflow-hidden bg-harbour-100 ${
            isFeatured ? "md:w-1/2 aspect-video md:aspect-auto" : "aspect-video -mx-4 -mt-4 mb-4"
          }`}
        >
          <img
            src={`/images/${event.coverImage}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}

      <div className={`flex flex-col gap-3 ${isFeatured ? "md:w-1/2 p-6" : ""}`}>
        <div className="flex items-start gap-3">
          {event.iconImage && (
            <div className="img-tint relative w-12 h-12 flex-shrink-0">
              <img
                src={`/images/${event.iconImage}`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <h3 className="font-semibold text-lg leading-tight truncate text-harbour-700">
              {event.title}
            </h3>
            {event.organizer && (
              <p className="text-sm text-harbour-400">
                {event.organizer}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 text-sm text-harbour-500">
          {nextDate && (
            <div className="flex items-center gap-2">
              <time dateTime={nextDate.startDate.toISOString()}>
                {format(nextDate.startDate, "EEE, MMM d 'at' h:mm a")}
              </time>
              {nextDate.endDate && (
                <>
                  <span className="text-harbour-300">-</span>
                  <time dateTime={nextDate.endDate.toISOString()}>
                    {format(nextDate.endDate, "h:mm a")}
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
          <p className="text-sm text-harbour-400 truncate">
            {event.location}
          </p>
        )}

        {isFeatured && (
          <div className="text-sm text-harbour-500 line-clamp-3">
            <RichMarkdown 
              content={event.description} 
              resolvedRefs={resolvedRefs}
              className="prose-harbour"
            />
          </div>
        )}

        <a
          href={event.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-harbour-600 hover:text-harbour-700 transition-colors"
        >
          View Event
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </article>
  );
}
