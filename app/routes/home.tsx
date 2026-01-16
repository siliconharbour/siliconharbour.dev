import type { Route } from "./+types/home";
import { Link, useLoaderData } from "react-router";
import { getEventsThisWeek, getUpcomingEvents } from "~/lib/events.server";
import { Calendar } from "~/components/Calendar";
import { EventCard } from "~/components/EventCard";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "siliconharbour.dev" },
    { name: "description", content: "Discover St. John's tech, events, companies, people, and more." },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const thisWeek = await getEventsThisWeek();
  const upcoming = await getUpcomingEvents();
  
  const thisWeekIds = new Set(thisWeek.map(e => e.id));
  const futureEvents = upcoming.filter(e => !thisWeekIds.has(e.id));

  return { thisWeek, futureEvents, allEvents: upcoming };
}

export default function Home() {
  const { thisWeek, futureEvents, allEvents } = useLoaderData<typeof loader>();

  const hasEvents = allEvents.length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-[40vh] min-h-[320px] flex flex-col items-center justify-center p-4">
        <img 
          src="/siliconharbour.svg" 
          alt="Silicon Harbour" 
          className="h-32 md:h-40 lg:h-48 w-auto"
        />
        <p className="text-2xl md:text-3xl lg:text-3xl font-bold text-harbour-600 tracking-wide pt-4">
          siliconharbour.dev
        </p>
        <a
          href="/calendar.ics"
          className="text-sm text-harbour-400 hover:text-harbour-600 transition-colors pt-4"
        >
          Subscribe to Calendar
        </a>
      </header>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto p-4 pb-8">
          {!hasEvents ? (
            <div className="text-center p-16">
              <h2 className="text-xl font-semibold text-harbour-700">No upcoming events</h2>
              <p className="text-harbour-400 pt-2">
                Check back soon for new events!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main content */}
              <div className="lg:col-span-2 flex flex-col gap-8">
                {/* This week */}
                {thisWeek.length > 0 && (
                  <section className="flex flex-col gap-4">
                    <h2 className="text-lg font-semibold text-harbour-700">This Week</h2>
                    <div className="flex flex-col gap-4">
                      {thisWeek.map((event) => (
                        <EventCard key={event.id} event={event} variant="featured" />
                      ))}
                    </div>
                  </section>
                )}

                {/* Upcoming events */}
                {futureEvents.length > 0 && (
                  <section className="flex flex-col gap-4">
                    <h2 className="text-lg font-semibold text-harbour-700">Upcoming Events</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {futureEvents.map((event) => (
                        <EventCard key={event.id} event={event} />
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* Sidebar with calendar */}
              <aside className="lg:col-span-1">
                <div className="sticky top-8">
                  <Calendar events={allEvents} />
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>

      <footer className="p-8">
        <div className="max-w-6xl mx-auto text-center">
          <Link 
            to="/manage/login" 
            className="text-sm text-harbour-300 hover:text-harbour-500 transition-colors"
          >
            login
          </Link>
        </div>
      </footer>
    </div>
  );
}
