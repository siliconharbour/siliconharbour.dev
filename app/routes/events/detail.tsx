import type { Route } from "./+types/detail";
import { Link, useLoaderData } from "react-router";
import { getEventBySlug, getEventWithOccurrences, type EventOccurrenceDisplay } from "~/lib/events.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { describeRecurrenceRule, parseRecurrenceRule } from "~/lib/recurrence.server";
import { getOptionalUser } from "~/lib/session.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { ReferencedBy } from "~/components/ReferencedBy";
import { formatInTimezone } from "~/lib/timezone";

export function meta({ data, params }: Route.MetaArgs) {
  const title = data?.event?.title ?? "Event";
  const siteUrl = "https://siliconharbour.dev";
  const ogImageUrl = `${siteUrl}/events/${params.slug}.png`;
  
  return [
    { title: `${title} - siliconharbour.dev` },
    { property: "og:title", content: title },
    { property: "og:type", content: "website" },
    { property: "og:image", content: ogImageUrl },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:image", content: ogImageUrl },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const event = await getEventBySlug(params.slug);
  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }
  
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  
  const resolvedRefs = await prepareRefsForClient(event.description);
  const backlinks = await getDetailedBacklinks("event", event.id);
  
  // For recurring events, get generated occurrences
  let occurrences: EventOccurrenceDisplay[] = [];
  let recurrenceDescription: string | null = null;
  
  if (event.recurrenceRule) {
    const eventWithOccurrences = await getEventWithOccurrences(event.id);
    occurrences = eventWithOccurrences?.occurrences || [];
    
    const parsed = parseRecurrenceRule(event.recurrenceRule);
    if (parsed) {
      recurrenceDescription = describeRecurrenceRule(parsed);
    }
  }
  
  return { event, resolvedRefs, backlinks, occurrences, recurrenceDescription, isAdmin };
}

function getEventLinkDomain(link: string): string {
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "external site";
  }
}

export default function EventDetail() {
  const { event, resolvedRefs, backlinks, occurrences, recurrenceDescription, isAdmin } = useLoaderData<typeof loader>();
  const isRecurring = !!event.recurrenceRule;
  const eventLinkDomain = getEventLinkDomain(event.link);

  return (
    <div className="py-8">
      <article className="flex flex-col gap-6">
        {/* Cover image - full width */}
        {event.coverImage && (
          <div className="max-w-4xl mx-auto w-full px-4">
            <div className="aspect-[3/1] relative overflow-hidden bg-harbour-100">
              <img
                src={`/images/${event.coverImage}`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Content container - 60ch centered */}
        <div className={`max-w-[60ch] mx-auto w-full px-4 flex flex-col gap-6 ${event.coverImage ? "-mt-12" : ""}`}>
          {/* Event info card with ring border */}
          <div className="bg-white p-4 ring-1 ring-harbour-200/50 flex flex-col gap-4">
            {/* Title with icon */}
            <div className="flex items-start gap-4">
              {event.iconImage && (
                <div className="relative w-20 h-20 flex-shrink-0">
                  <img
                    src={`/images/${event.iconImage}`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-bold text-harbour-700">{event.title}</h1>
                  {isAdmin && (
                    <Link
                      to={`/manage/events/${event.id}`}
                      className="p-1.5 text-harbour-400 hover:text-harbour-600 hover:bg-harbour-100 transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </Link>
                  )}
                </div>
                {event.organizer && (
                  <p className="text-harbour-500 mt-1">Organized by {event.organizer}</p>
                )}
              </div>
            </div>

            {/* Recurring event badge */}
            {isRecurring && recurrenceDescription && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-harbour-100 text-harbour-700 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Recurring Event
                </span>
                <span className="text-harbour-600">{recurrenceDescription}</span>
              </div>
            )}

            {/* When */}
            <div className="flex gap-2">
              <span className="text-harbour-500">When:</span>
              <div className="flex flex-col gap-1">
                {isRecurring ? (
                  occurrences.length > 0 ? (
                    <>
                      {occurrences.slice(0, 8).map((occ, i) => (
                        <div key={i} className={`${occ.cancelled ? 'line-through text-harbour-400' : ''}`}>
                          <time dateTime={occ.date.toISOString()} className="font-semibold text-harbour-700">
                            {formatInTimezone(occ.date, "EEEE, MMMM d, yyyy 'at' h:mm a")}
                          </time>
                          {occ.endDate && (
                            <span className="font-semibold text-harbour-700">
                              {" - "}
                              {formatInTimezone(occ.endDate, "h:mm a")}
                            </span>
                          )}
                          {occ.cancelled && <span className="ml-2 text-red-500">(Cancelled)</span>}
                          {occ.location && occ.location !== event.location && (
                            <span className="ml-2 text-harbour-400">at {occ.location}</span>
                          )}
                        </div>
                      ))}
                      {occurrences.length > 8 && (
                        <p className="text-sm text-harbour-400">
                          + {occurrences.length - 8} more dates
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-harbour-400">No upcoming dates scheduled</p>
                  )
                ) : (
                  event.dates.map((date, i) => (
                    <div key={i}>
                      <time dateTime={date.startDate.toISOString()} className="font-semibold text-harbour-700">
                        {formatInTimezone(date.startDate, "EEEE, MMMM d, yyyy 'at' h:mm a")}
                      </time>
                      {date.endDate && (
                        <span className="font-semibold text-harbour-700">
                          {" - "}
                          {formatInTimezone(date.endDate, "h:mm a")}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Where */}
            {event.location && (
              <div className="flex gap-2">
                <span className="text-harbour-500">Where:</span>
                <span className="font-semibold text-harbour-700">{event.location}</span>
              </div>
            )}

            {/* Signup/View button */}
            <a
              href={event.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors self-start"
            >
              {event.requiresSignup ? "Signup for" : "View"} event on {eventLinkDomain}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          {/* Description - outside the card */}
          <div className="prose">
            <RichMarkdown content={event.description} resolvedRefs={resolvedRefs} />
          </div>

          <ReferencedBy backlinks={backlinks} />
        </div>
      </article>
    </div>
  );
}
