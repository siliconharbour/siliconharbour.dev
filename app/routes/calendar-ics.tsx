import type { Route } from "./+types/calendar-ics";
import { createEvents, type EventAttributes } from "ics";
import { getUpcomingEvents } from "~/lib/events.server";

function toDateArray(d: Date): [number, number, number, number, number] {
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const events = await getUpcomingEvents();

  const icsEvents: EventAttributes[] = [];

  for (const event of events) {
    for (const date of event.dates) {
      const startDate = date.startDate;
      const endDate = date.endDate || new Date(startDate.getTime() + 60 * 60 * 1000);

      const attrs: EventAttributes = {
        title: event.title,
        description: event.description,
        location: event.location || undefined,
        url: `https://siliconharbour.dev/events/${event.slug}`,
        start: toDateArray(startDate),
        startInputType: "utc",
        startOutputType: "utc",
        end: toDateArray(endDate),
        endInputType: "utc",
        endOutputType: "utc",
        uid: `${event.id}-${date.id}@siliconharbour.dev`,
      };

      // ORGANIZER requires a mailto: URI per RFC 5545.
      // We only have a display name, so use a noreply address.
      if (event.organizer) {
        attrs.organizer = {
          name: event.organizer,
          email: "events@siliconharbour.dev",
        };
      }

      icsEvents.push(attrs);
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
      "Cache-Control": "public, max-age=3600",
    },
  });
}
