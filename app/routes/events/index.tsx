import type { Route } from "./+types/index";
import { useLoaderData, useSearchParams } from "react-router";
import { getPaginatedEvents, type EventFilter } from "~/lib/events.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Events - siliconharbour.dev" },
    { name: "description", content: "Tech events in St. John's" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  const filter = (url.searchParams.get("filter") || "upcoming") as EventFilter;
  
  const { items: events, total } = await getPaginatedEvents(limit, offset, searchQuery, filter);
  
  return { events, total, limit, offset, searchQuery, filter };
}

export default function EventsIndex() {
  const { events, total, limit, offset, searchQuery, filter } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">Events</h1>
            <p className="text-harbour-500">Tech events in the community</p>
          </div>
          
          {/* Filter tabs */}
          <div className="flex gap-2">
            <a
              href={`/events?filter=upcoming${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
              className={`px-3 py-1.5 text-sm no-underline transition-colors ${
                filter === "upcoming"
                  ? "bg-harbour-600 text-white"
                  : "text-harbour-600 border border-harbour-200 hover:border-harbour-300"
              }`}
            >
              Upcoming
            </a>
            <a
              href={`/events?filter=past${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
              className={`px-3 py-1.5 text-sm no-underline transition-colors ${
                filter === "past"
                  ? "bg-harbour-600 text-white"
                  : "text-harbour-600 border border-harbour-200 hover:border-harbour-300"
              }`}
            >
              Past
            </a>
            <a
              href={`/events?filter=all${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
              className={`px-3 py-1.5 text-sm no-underline transition-colors ${
                filter === "all"
                  ? "bg-harbour-600 text-white"
                  : "text-harbour-600 border border-harbour-200 hover:border-harbour-300"
              }`}
            >
              All
            </a>
          </div>
          
          {/* Search */}
          <SearchInput placeholder="Search events..." preserveParams={["filter"]} />
          
          {/* Result count */}
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>

        {events.length === 0 ? (
          <p className="text-harbour-400">
            {searchQuery 
              ? "No events match your search." 
              : filter === "upcoming" 
                ? "No upcoming events at the moment."
                : filter === "past"
                  ? "No past events found."
                  : "No events listed yet."}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <a
                key={event.id}
                href={`/events/${event.slug}`}
                className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all no-underline"
              >
                {event.coverImage && (
                  <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
                    <img
                      src={`/images/${event.coverImage}`}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <h2 className="font-semibold text-harbour-700 group-hover:text-harbour-600">
                    {event.title}
                  </h2>
                  {event.dates[0] && (
                    <p className="text-sm text-harbour-500">
                      {format(event.dates[0].startDate, "EEE, MMM d 'at' h:mm a")}
                    </p>
                  )}
                  {event.location && (
                    <p className="text-sm text-harbour-400">{event.location}</p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
        
        <Pagination total={total} limit={limit} offset={offset} />
      </div>
    </div>
  );
}
