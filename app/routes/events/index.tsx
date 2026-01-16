import type { Route } from "./+types/index";
import { useLoaderData } from "react-router";
import { getUpcomingEvents } from "~/lib/events.server";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Events - siliconharbour.dev" },
    { name: "description", content: "Tech events in St. John's" },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const events = await getUpcomingEvents();
  return { events };
}

export default function EventsIndex() {
  const { events } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-harbour-700">Events</h1>
          <p className="text-harbour-500">Upcoming tech events in the community</p>
        </div>

        {events.length === 0 ? (
          <p className="text-harbour-400">No upcoming events at the moment.</p>
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
      </div>
    </div>
  );
}
