import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { getPaginatedEvents, getUpcomingEvents, type EventFilter } from "~/lib/events.server";
import { getOptionalUser } from "~/lib/session.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";
import { Calendar } from "~/components/Calendar";
import { EventCard } from "~/components/EventCard";
import { format, parse } from "date-fns";

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
  const dateFilter = url.searchParams.get("date") || undefined;

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const [paginatedResult, allEvents] = await Promise.all([
    getPaginatedEvents(limit, offset, searchQuery, filter, dateFilter),
    getUpcomingEvents(), // For calendar display
  ]);

  return {
    events: paginatedResult.items,
    total: paginatedResult.total,
    limit,
    offset,
    searchQuery,
    filter,
    dateFilter,
    allEvents,
    isAdmin,
  };
}

export default function EventsIndex() {
  const { events, total, limit, offset, searchQuery, filter, dateFilter, allEvents, isAdmin } =
    useLoaderData<typeof loader>();

  // Format the date filter for display
  const dateFilterDisplay = dateFilter
    ? format(parse(dateFilter, "yyyy-MM-dd", new Date()), "MMMM d, yyyy")
    : null;

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h1 className="text-3xl font-bold text-harbour-700">Events</h1>
                  {isAdmin && (
                    <Link
                      to="/manage/events/new"
                      className="px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
                    >
                      + New Event
                    </Link>
                  )}
                </div>
                <p className="text-harbour-500">Tech events in the community</p>
              </div>

              {/* Filter tabs */}
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/events?filter=upcoming${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    filter === "upcoming" && !dateFilter
                      ? "bg-harbour-600 text-white"
                      : "text-harbour-600 border border-harbour-200 hover:border-harbour-300"
                  }`}
                >
                  Upcoming
                </a>
                <a
                  href={`/events?filter=past${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    filter === "past" && !dateFilter
                      ? "bg-harbour-600 text-white"
                      : "text-harbour-600 border border-harbour-200 hover:border-harbour-300"
                  }`}
                >
                  Past
                </a>
                <a
                  href={`/events?filter=all${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    filter === "all" && !dateFilter
                      ? "bg-harbour-600 text-white"
                      : "text-harbour-600 border border-harbour-200 hover:border-harbour-300"
                  }`}
                >
                  All
                </a>
                {dateFilter && (
                  <span className="px-3 py-1.5 text-sm bg-harbour-600 text-white flex items-center gap-2">
                    {dateFilterDisplay}
                    <a
                      href={`/events?filter=${filter}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                      className="text-white/80 hover:text-white"
                      title="Clear date filter"
                    >
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </a>
                  </span>
                )}
              </div>

              {/* Search */}
              <SearchInput placeholder="Search events..." preserveParams={["filter", "date"]} />

              {/* Result count */}
              {(searchQuery || dateFilter) && (
                <p className="text-sm text-harbour-500">
                  {total} event{total !== 1 ? "s" : ""}
                  {searchQuery && ` matching "${searchQuery}"`}
                  {dateFilter && ` on ${dateFilterDisplay}`}
                </p>
              )}
            </div>

            {events.length === 0 ? (
              <p className="text-harbour-400">
                {searchQuery
                  ? "No events match your search."
                  : dateFilter
                    ? `No events on ${dateFilterDisplay}.`
                    : filter === "upcoming"
                      ? "No upcoming events at the moment."
                      : filter === "past"
                        ? "No past events found."
                        : "No events listed yet."}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}

            <Pagination total={total} limit={limit} offset={offset} />
          </div>
        </div>

        {/* Sidebar with Calendar */}
        <aside className="lg:col-span-1">
          <div className="sticky top-8">
            <div className="ring-1 ring-harbour-200/50">
              <Calendar events={allEvents} alwaysFilterByDate />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
