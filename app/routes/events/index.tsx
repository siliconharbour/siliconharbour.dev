import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { getPaginatedEvents } from "~/lib/events.server";
import { getOptionalUser } from "~/lib/session.server";
import { Pagination } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";
import { Calendar } from "~/components/Calendar";
import { EventCard } from "~/components/EventCard";
import { format, parse } from "date-fns";
import { parseEventsQuery } from "~/lib/public-query.server";
import { buildSeoMeta } from "~/lib/seo";

export function meta({}: Route.MetaArgs) {
  return buildSeoMeta({
    title: "Tech Events in St. John's, NL",
    description:
      "Upcoming tech meetups, talks, hackathons, and events in St. John's, Newfoundland. Discover what's on in the local tech scene.",
    url: "/events",
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset, searchQuery, filter, dateFilter } = parseEventsQuery(url);

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const paginatedResult = await getPaginatedEvents(limit, offset, searchQuery, filter, dateFilter);

  return {
    events: paginatedResult.items,
    total: paginatedResult.total,
    limit,
    offset,
    searchQuery,
    filter,
    dateFilter,
    isAdmin,
  };
}

export default function EventsIndex() {
  const { events, total, limit, offset, searchQuery, filter, dateFilter, isAdmin } =
    useLoaderData<typeof loader>();
  // Format the date filter for display
  const dateFilterDisplay = dateFilter
    ? format(parse(dateFilter, "yyyy-MM-dd", new Date()), "MMMM d, yyyy")
    : null;

  return (
    <div className="max-w-6xl mx-auto p-pad-4 py-pad-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gap-8">
        {/* Main content */}
        <div className="lg:col-span-2">
          <div className="flex flex-col gap-gap-8">
            <div className="flex flex-col gap-gap-4">
              <div className="flex flex-col gap-gap-2">
                <div className="flex items-center justify-between">
                  <h1 className="text-3xl font-bold text-heading">Events</h1>
                  {isAdmin && (
                    <Link
                      to="/manage/events/new"
                      className="px-pad-3 py-pad-1-5 text-sm bg-primary text-white hover:bg-primary-hover transition-colors"
                    >
                      + New Event
                    </Link>
                  )}
                </div>
                <p className="text-muted">Tech events in the community</p>
              </div>

              {/* Filter tabs */}
              <div className="flex flex-wrap gap-gap-2">
                <a
                  href={`/events?filter=upcoming${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                  className={`px-pad-3 py-pad-1-5 text-sm transition-colors ${
                    filter === "upcoming" && !dateFilter
                      ? "bg-primary text-white"
                      : "text-body border border-line hover:border-harbour-300"
                  }`}
                >
                  Upcoming
                </a>
                <a
                  href={`/events?filter=past${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                  className={`px-pad-3 py-pad-1-5 text-sm transition-colors ${
                    filter === "past" && !dateFilter
                      ? "bg-primary text-white"
                      : "text-body border border-line hover:border-harbour-300"
                  }`}
                >
                  Past
                </a>
                <a
                  href={`/events?filter=all${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                  className={`px-pad-3 py-pad-1-5 text-sm transition-colors ${
                    filter === "all" && !dateFilter
                      ? "bg-primary text-white"
                      : "text-body border border-line hover:border-harbour-300"
                  }`}
                >
                  All
                </a>
                {dateFilter && (
                  <span className="px-pad-3 py-pad-1-5 text-sm bg-primary text-white flex items-center gap-gap-2">
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
                <p className="text-sm text-muted">
                  {total} event{total !== 1 ? "s" : ""}
                  {searchQuery && ` matching "${searchQuery}"`}
                  {dateFilter && ` on ${dateFilterDisplay}`}
                </p>
              )}
            </div>

            {events.length === 0 ? (
              <p className="text-subtle">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-6">
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
              <Calendar alwaysFilterByDate />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
