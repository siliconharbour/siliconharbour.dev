import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllEvents } from "~/lib/events.server";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Events - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const events = await getAllEvents();
  return { events };
}

export default function ManageEventsIndex() {
  const { events } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">Events</h1>
          <Link
            to="/manage/events/new"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            New Event
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="text-center p-12 text-harbour-400">
            No events yet. Create your first event to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-4 p-4 bg-white border border-harbour-200"
              >
                {event.iconImage ? (
                  <img
                    src={`/images/${event.iconImage}`}
                    alt=""
                    className="w-12 h-12 object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 bg-harbour-100" />
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium truncate text-harbour-700">{event.title}</h2>
                    {event.recurrenceRule && (
                      <span className="px-1.5 py-0.5 bg-harbour-100 text-harbour-600 text-xs shrink-0">
                        Recurring
                      </span>
                    )}
                  </div>
                  {event.recurrenceRule ? (
                    <p className="text-sm text-harbour-400">
                      {event.defaultStartTime && `${event.defaultStartTime}`}
                      {event.defaultEndTime && ` - ${event.defaultEndTime}`}
                    </p>
                  ) : event.dates.length > 0 ? (
                    <p className="text-sm text-harbour-400">
                      {format(event.dates[0].startDate, "MMM d, yyyy")}
                      {event.dates.length > 1 && ` (+${event.dates.length - 1} more)`}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/manage/events/${event.id}`}
                    className="px-3 py-1.5 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/manage/events/${event.id}/delete`}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <Link
            to="/manage"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
