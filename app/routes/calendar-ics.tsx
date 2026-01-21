import type { Route } from "./+types/calendar-ics";
import { createEvents, type EventAttributes } from "ics";
import { getUpcomingEvents } from "~/lib/events.server";
import { toZonedTime } from "date-fns-tz";
import { SITE_TIMEZONE } from "~/lib/timezone";

export async function loader({}: Route.LoaderArgs) {
  const events = await getUpcomingEvents();

  const icsEvents: EventAttributes[] = [];

  for (const event of events) {
    for (const date of event.dates) {
      // Convert to Newfoundland timezone for display
      const start = toZonedTime(date.startDate, SITE_TIMEZONE);
      const endDate = date.endDate || new Date(date.startDate.getTime() + 60 * 60 * 1000);
      const end = toZonedTime(endDate, SITE_TIMEZONE);

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
        startInputType: "local",
        startOutputType: "local",
        end: [
          end.getFullYear(),
          end.getMonth() + 1,
          end.getDate(),
          end.getHours(),
          end.getMinutes(),
        ],
        endInputType: "local",
        endOutputType: "local",
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
