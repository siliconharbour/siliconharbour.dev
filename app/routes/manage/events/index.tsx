import { operationCatalog } from "~/operations/catalog";
import { loadAdminOperation } from "~/lib/admin/run-operation.server";
import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { SearchInput } from "~/components/SearchInput";
import { Pagination } from "~/components/manage/Pagination";
import { formatInTimezone } from "~/lib/timezone";

const PER_PAGE = 50;

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Events - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const offset = (page - 1) * PER_PAGE;
  const { items: events, total } = await loadAdminOperation(request, operationCatalog.eventList, {
    limit: PER_PAGE,
    offset,
    query: searchQuery,
  });
  const totalPages = Math.ceil(total / PER_PAGE);
  return { events, searchQuery, currentPage: page, totalPages, total };
}

export default function ManageEventsIndex() {
  const { events, currentPage, totalPages, total } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-gap-6">
        <div className="flex flex-wrap items-center justify-between gap-gap-2">
          <h1 className="text-2xl font-semibold text-heading">Events</h1>
          <Link
            to="/manage/events/new"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            New Event
          </Link>
        </div>

        <SearchInput placeholder="Search events..." />

        {events.length === 0 ? (
          <div className="text-center p-pad-12 text-subtle">
            No events yet. Create your first event to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-gap-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-gap-4 p-pad-4 bg-surface border border-line rounded-panel"
              >
                {event.iconImage ? (
                  <img
                    src={`/images/${event.iconImage}`}
                    alt=""
                    className="w-12 h-12 object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-tint" />
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-gap-0-5">
                  <div className="flex items-center gap-gap-2">
                    <h2 className="font-medium truncate text-heading">{event.title}</h2>
                    {event.recurrenceRule && (
                      <span className="px-pad-1-5 py-pad-0-5 bg-tint text-body text-xs shrink-0">
                        Recurring
                      </span>
                    )}
                    {event.timeMode === "period" && (
                      <span className="px-pad-1-5 py-pad-0-5 bg-green-100 text-green-700 text-xs shrink-0">
                        Time period
                      </span>
                    )}
                  </div>
                  {event.recurrenceRule ? (
                    <p className="text-sm text-subtle">
                      {event.defaultStartTime && `${event.defaultStartTime}`}
                      {event.defaultEndTime && ` - ${event.defaultEndTime}`}
                    </p>
                  ) : event.dates.length > 0 ? (
                    <p className="text-sm text-subtle">
                      {formatInTimezone(new Date(event.dates[0].startDate), "MMM d, yyyy")}
                      {event.timeMode === "period" &&
                        event.dates[0].endDate &&
                        ` - ${formatInTimezone(new Date(event.dates[0].endDate), "MMM d, yyyy")}`}
                      {event.dates.length > 1 && ` (+${event.dates.length - 1} more)`}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-gap-2">
                  <Link
                    to={`/manage/events/${event.id}`}
                    className="px-pad-3 py-pad-1-5 text-sm font-medium text-body hover:bg-soft transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/manage/events/${event.id}/delete`}
                    className="px-pad-3 py-pad-1-5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <Pagination currentPage={currentPage} totalPages={totalPages} total={total} />

        <div>
          <Link to="/manage" className="text-sm text-subtle hover:text-body">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
