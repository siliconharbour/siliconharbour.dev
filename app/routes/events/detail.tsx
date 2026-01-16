import type { Route } from "./+types/detail";
import { useLoaderData } from "react-router";
import { getEventBySlug } from "~/lib/events.server";
import { prepareRefsForClient, getRichIncomingReferences } from "~/lib/references.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { format } from "date-fns";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.event?.title ?? "Event"} - siliconharbour.dev` },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const event = await getEventBySlug(params.slug);
  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }
  
  const resolvedRefs = await prepareRefsForClient(event.description);
  const backlinks = await getRichIncomingReferences("event", event.id);
  
  return { event, resolvedRefs, backlinks };
}

export default function EventDetail() {
  const { event, resolvedRefs, backlinks } = useLoaderData<typeof loader>();

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
          <h1 className="text-3xl font-bold text-harbour-700">{event.title}</h1>
          
          {event.organizer && (
            <p className="text-harbour-500">Organized by {event.organizer}</p>
          )}

          <div className="flex flex-col gap-2">
            {event.dates.map((date, i) => (
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
            ))}
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
          className="inline-flex items-center gap-2 px-4 py-2 bg-harbour-600 text-white font-medium hover:bg-harbour-700 transition-colors no-underline self-start"
        >
          View Event Details
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>

        {backlinks.length > 0 && (
          <div className="border-t border-harbour-200/50 pt-6">
            <h2 className="text-lg font-semibold text-harbour-700 mb-3">Referenced By</h2>
            <ul className="flex flex-col gap-2">
              {backlinks.map((link) => (
                <li key={`${link.type}-${link.id}`}>
                  <a href={link.url} className="text-harbour-600 hover:text-harbour-700">
                    {link.name}
                  </a>
                  <span className="text-harbour-400 text-sm ml-2">({link.type})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
}
