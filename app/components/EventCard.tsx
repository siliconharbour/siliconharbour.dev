import { Link } from "react-router";
import type { Event, EventDate } from "~/db/schema";
import { RichMarkdown, type ResolvedRef } from "./RichMarkdown";
import { formatInTimezone } from "~/lib/timezone";

type EventCardProps = {
  event: Event & { dates: EventDate[] };
  variant?: "featured" | "default" | "compact";
  resolvedRefs?: Record<string, ResolvedRef>;
};

function describeRecurrence(rule: string | null): string | null {
  if (!rule) return null;
  const parts = rule.split(";");
  let freq = "";
  let interval = 1;
  let dayCode = "";
  let position = 0;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "FREQ") freq = value;
    if (key === "INTERVAL") interval = parseInt(value, 10);
    if (key === "BYDAY") {
      const match = value.match(/^(-?\d)?([A-Z]{2})$/);
      if (match) {
        if (match[1]) position = parseInt(match[1], 10);
        dayCode = match[2];
      }
    }
  }

  const dayNames: Record<string, string> = {
    SU: "Sunday", MO: "Monday", TU: "Tuesday", WE: "Wednesday",
    TH: "Thursday", FR: "Friday", SA: "Saturday",
  };
  const day = dayNames[dayCode] || dayCode;

  if (freq === "WEEKLY") {
    return interval === 2 ? `Every other ${day}` : `Every ${day}`;
  }
  if (freq === "MONTHLY") {
    const positions: Record<number, string> = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", [-1]: "Last" };
    return `${positions[position] || ""} ${day} of every month`.trim();
  }
  return "Recurring";
}

/**
 * Wrapper that adds a stacked-papers effect behind recurring event cards.
 * Two offset divs peek out bottom-right behind the card content.
 */
function StackedWrapper({ isRecurring, children }: { isRecurring: boolean; children: React.ReactNode }) {
  if (!isRecurring) return <>{children}</>;

  return (
    <div className="relative pb-[6px] pr-[6px]">
      {/* Back card (furthest) */}
      <div className="absolute top-[6px] left-[6px] right-0 bottom-0 ring-1 ring-harbour-200/50 bg-harbour-50" />
      {/* Middle card */}
      <div className="absolute top-[3px] left-[3px] right-[3px] bottom-[3px] ring-1 ring-harbour-200/70 bg-harbour-50" />
      {/* Front card (the actual content) */}
      <div className="relative">
        {children}
      </div>
    </div>
  );
}

export function EventCard({ event, variant = "default", resolvedRefs }: EventCardProps) {
  const nextDate = event.dates[0];
  const hasMultipleDates = event.dates.length > 1;

  const isFeatured = variant === "featured";

  if (isFeatured) {
    return (
      <StackedWrapper isRecurring={!!event.recurrenceRule}>
        <Link
          to={`/events/${event.slug}`}
          className={`group relative block bg-white ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all ${event.coverImage ? "pb-3" : ""}`}
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

            <div className="mt-2 flex flex-col gap-2">
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
                {event.recurrenceRule ? (
                  <span className="text-xs text-harbour-400">
                    {describeRecurrence(event.recurrenceRule)}
                  </span>
                ) : hasMultipleDates ? (
                  <span className="text-xs text-harbour-400">
                    +{event.dates.length - 1} more date{event.dates.length > 2 ? "s" : ""}
                  </span>
                ) : null}
                {event.location && (
                  <span className="text-harbour-400 truncate">{event.location}</span>
                )}
              </div>

              <div className="text-sm text-harbour-500 line-clamp-2">
                <RichMarkdown
                  content={event.description}
                  resolvedRefs={resolvedRefs}
                  className="prose-harbour"
                />
              </div>
            </div>
          </div>
        </Link>
      </StackedWrapper>
    );
  }

  // Compact card -- smaller, no cover image, used for recurring events section
  if (variant === "compact") {
    return (
      <StackedWrapper isRecurring={!!event.recurrenceRule}>
        <Link
          to={`/events/${event.slug}`}
          className="group relative block bg-white ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
        >
          <div className="relative bg-white p-3">
            <div className="flex items-start gap-2.5">
              {event.iconImage && (
                <div className="img-tint relative w-10 h-10 flex-shrink-0">
                  <img
                    src={`/images/${event.iconImage}`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <h3 className="font-semibold text-sm leading-tight text-harbour-700 group-hover:text-harbour-600">
                  {event.title}
                </h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-harbour-500">
                  {event.recurrenceRule && (
                    <span className="text-harbour-400">
                      {describeRecurrence(event.recurrenceRule)}
                    </span>
                  )}
                  {nextDate && (
                    <span className="text-harbour-400">
                      Next: {formatInTimezone(nextDate.startDate, "MMM d")}
                    </span>
                  )}
                </div>
                {event.location && (
                  <p className="text-xs text-harbour-400 truncate">{event.location}</p>
                )}
              </div>
            </div>
          </div>
        </Link>
      </StackedWrapper>
    );
  }

  // Default (non-featured) card
  return (
    <StackedWrapper isRecurring={!!event.recurrenceRule}>
      <Link
        to={`/events/${event.slug}`}
        className={`group relative block bg-white ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all ${event.coverImage ? "pb-3" : ""}`}
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
              {event.recurrenceRule ? (
                <span className="text-xs text-harbour-400 ml-2">
                  {describeRecurrence(event.recurrenceRule)}
                </span>
              ) : hasMultipleDates ? (
                <span className="text-xs text-harbour-400 ml-2">+{event.dates.length - 1} more</span>
              ) : null}
            </div>

            {event.location && <p className="text-sm text-harbour-400 truncate">{event.location}</p>}
          </div>
        </div>
      </Link>
    </StackedWrapper>
  );
}
