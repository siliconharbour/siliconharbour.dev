import type { Route } from "./+types/detail";
import { Link, useLoaderData } from "react-router";
import { getEventBySlug, getEventWithOccurrences, type EventOccurrenceDisplay } from "~/lib/events.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { describeRecurrenceRule, parseRecurrenceRule } from "~/lib/recurrence.server";
import { getOptionalUser } from "~/lib/session.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { ReferencedBy } from "~/components/ReferencedBy";
import { format } from "date-fns";

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

export default function EventDetail() {
  const { event, resolvedRefs, backlinks, occurrences, recurrenceDescription, isAdmin } = useLoaderData<typeof loader>();
  const isRecurring = !!event.recurrenceRule;

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="flex flex-col gap-6">
        {event.coverImage && (
          <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
            <img
              src={`/images/${event.coverImage}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex flex-col gap-4">
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
            <p className="text-harbour-500">Organized by {event.organizer}</p>
          )}

          {/* Recurring event badge and description */}
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

          {/* Show dates - either explicit dates or generated occurrences */}
          <div className="flex flex-col gap-2">
            {isRecurring ? (
              // Show upcoming occurrences for recurring events
              occurrences.length > 0 ? (
                <>
                  <h3 className="text-sm font-medium text-harbour-500">Upcoming Dates</h3>
                  {occurrences.slice(0, 8).map((occ, i) => (
                    <div key={i} className={`text-harbour-600 ${occ.cancelled ? 'line-through text-harbour-400' : ''}`}>
                      <time dateTime={occ.date.toISOString()}>
                        {format(occ.date, "EEEE, MMMM d, yyyy 'at' h:mm a")}
                      </time>
                      {occ.endDate && (
                        <>
                          {" - "}
                          <time dateTime={occ.endDate.toISOString()}>
                            {format(occ.endDate, "h:mm a")}
                          </time>
                        </>
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
              // Show explicit dates for one-time events
              event.dates.map((date, i) => (
                <div key={i} className="text-harbour-600">
                  <time dateTime={date.startDate.toISOString()}>
                    {format(date.startDate, "EEEE, MMMM d, yyyy 'at' h:mm a")}
                  </time>
                  {date.endDate && (
                    <>
                      {" - "}
                      <time dateTime={date.endDate.toISOString()}>
                        {format(date.endDate, "h:mm a")}
                      </time>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {event.location && (
            <p className="text-harbour-500">{event.location}</p>
          )}
        </div>

        <RichMarkdown content={event.description} resolvedRefs={resolvedRefs} />

        <a
          href={event.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors self-start"
        >
          View Event Details
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>

        <ReferencedBy backlinks={backlinks} />
      </article>
    </div>
  );
}
