import type { Route } from "./+types/calendar-ics";
import { createEvents, type EventAttributes } from "ics";
import { getUpcomingEvents } from "~/lib/events.server";

export async function loader({}: Route.LoaderArgs) {
  const events = await getUpcomingEvents();

  const icsEvents: EventAttributes[] = [];

  for (const event of events) {
    for (const date of event.dates) {
      const start = date.startDate;
      const end = date.endDate || new Date(start.getTime() + 60 * 60 * 1000); // Default 1 hour if no end

      icsEvents.push({
        title: event.title,
        description: event.description,
        location: event.location || undefined,
        url: event.link,
        organizer: event.organizer ? { name: event.organizer } : undefined,
        start: [
          start.getFullYear(),
          start.getMonth() + 1,
          start.getDate(),
          start.getHours(),
          start.getMinutes(),
        ],
        end: [
          end.getFullYear(),
          end.getMonth() + 1,
          end.getDate(),
          end.getHours(),
          end.getMinutes(),
        ],
        uid: `${event.id}-${date.id}@siliconharbour.dev`,
      });
    }
  }

  const { error, value } = createEvents(icsEvents);

  if (error || !value) {
    throw new Response("Failed to generate calendar", { status: 500 });
  }

  return new Response(value, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="siliconharbour-events.ics"',
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
    },
  });
}
