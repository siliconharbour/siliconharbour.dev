import type { Route } from "./+types/calendar-ics";
import { createEvents, type EventAttributes } from "ics";
import { getUpcomingEvents, getEventOccurrenceOverrides } from "~/lib/events.server";
import { parseAsTimezone } from "~/lib/timezone";

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
  let isFirst = true;

  for (const event of events) {
    const calMeta = isFirst
      ? { calName: "Silicon Harbour", productId: "siliconharbour.dev/ics" }
      : {};

    if (event.recurrenceRule) {
      // --- Recurring event: emit one VEVENT with RRULE ---
      const startTime = event.defaultStartTime || "18:00";

      // Use first generated date as DTSTART
      const firstDate = event.dates[0];
      if (!firstDate) {
        isFirst = false;
        continue;
      }

      const startDate = firstDate.startDate;
      const endDate =
        firstDate.endDate || new Date(startDate.getTime() + 60 * 60 * 1000);

      // Build RRULE string with UNTIL if recurrenceEnd is set
      let rrule = event.recurrenceRule;
      if (event.recurrenceEnd) {
        const untilArr = toDateArray(event.recurrenceEnd);
        const until = `${untilArr[0]}${String(untilArr[1]).padStart(2, "0")}${String(untilArr[2]).padStart(2, "0")}T235959Z`;
        rrule = `${rrule};UNTIL=${until}`;
      }

      // Get all overrides for this event
      const overrides = await getEventOccurrenceOverrides(event.id);
      const exclusionDates: [number, number, number, number, number][] = [];
      const modifiedOverrides: typeof overrides = [];

      for (const override of overrides) {
        if (override.cancelled) {
          // Cancelled occurrences become EXDATE
          const occDateStr = override.occurrenceDate.toISOString().split("T")[0];
          const occDateTime = parseAsTimezone(occDateStr, startTime);
          exclusionDates.push(toDateArray(occDateTime));
        } else if (override.location || override.startTime || override.endTime) {
          // Modified occurrences: EXDATE the original + emit standalone VEVENT
          const occDateStr = override.occurrenceDate.toISOString().split("T")[0];
          const occDateTime = parseAsTimezone(occDateStr, startTime);
          exclusionDates.push(toDateArray(occDateTime));
          modifiedOverrides.push(override);
        }
      }

      // Master recurring VEVENT
      const masterAttrs: EventAttributes = {
        ...calMeta,
        title: event.title,
        description: `https://siliconharbour.dev/events/${event.slug}\n\n${event.description}`,
        location: event.location || undefined,
        url: `https://siliconharbour.dev/events/${event.slug}`,
        start: toDateArray(startDate),
        startInputType: "utc",
        startOutputType: "utc",
        end: toDateArray(endDate),
        endInputType: "utc",
        endOutputType: "utc",
        status: "CONFIRMED" as const,
        transp: "TRANSPARENT" as const,
        categories: ["Tech", "Community"],
        created: toDateArray(event.createdAt),
        lastModified: toDateArray(event.updatedAt),
        uid: `event-${event.id}@siliconharbour.dev`,
        recurrenceRule: rrule,
        exclusionDates: exclusionDates.length > 0 ? exclusionDates : undefined,
      };

      if (event.organizer) {
        masterAttrs.organizer = {
          name: event.organizer,
          email: "admin@siliconharbour.dev",
        };
      }

      icsEvents.push(masterAttrs);
      isFirst = false;

      // Emit standalone VEVENTs for modified occurrences
      for (const override of modifiedOverrides) {
        const occDateStr = override.occurrenceDate.toISOString().split("T")[0];
        const overrideStartTime = override.startTime || startTime;
        const overrideEndTime = override.endTime || event.defaultEndTime;

        const overrideStart = parseAsTimezone(occDateStr, overrideStartTime);
        const overrideEnd = overrideEndTime
          ? parseAsTimezone(occDateStr, overrideEndTime)
          : new Date(overrideStart.getTime() + 60 * 60 * 1000);

        const overrideAttrs: EventAttributes = {
          title: event.title,
          description: override.description
            ? `https://siliconharbour.dev/events/${event.slug}\n\n${override.description}`
            : `https://siliconharbour.dev/events/${event.slug}\n\n${event.description}`,
          location: override.location || event.location || undefined,
          url: `https://siliconharbour.dev/events/${event.slug}`,
          start: toDateArray(overrideStart),
          startInputType: "utc",
          startOutputType: "utc",
          end: toDateArray(overrideEnd),
          endInputType: "utc",
          endOutputType: "utc",
          status: "CONFIRMED" as const,
          transp: "TRANSPARENT" as const,
          categories: ["Tech", "Community"],
          uid: `event-${event.id}-override-${occDateStr.replace(/-/g, "")}@siliconharbour.dev`,
        };

        if (event.organizer) {
          overrideAttrs.organizer = {
            name: event.organizer,
            email: "admin@siliconharbour.dev",
          };
        }

        icsEvents.push(overrideAttrs);
      }
    } else {
      // --- One-time event: emit individual VEVENTs (unchanged) ---
      for (const date of event.dates) {
        const startDate = date.startDate;
        const endDate = date.endDate || new Date(startDate.getTime() + 60 * 60 * 1000);

        const attrs: EventAttributes = {
          ...calMeta,
          title: event.title,
          description: `https://siliconharbour.dev/events/${event.slug}\n\n${event.description}`,
          location: event.location || undefined,
          url: `https://siliconharbour.dev/events/${event.slug}`,
          start: toDateArray(startDate),
          startInputType: "utc",
          startOutputType: "utc",
          end: toDateArray(endDate),
          endInputType: "utc",
          endOutputType: "utc",
          status: "CONFIRMED" as const,
          transp: "TRANSPARENT" as const,
          categories: ["Tech", "Community"],
          created: toDateArray(event.createdAt),
          lastModified: toDateArray(event.updatedAt),
          uid: `${event.id}-${date.id}@siliconharbour.dev`,
        };

        if (event.organizer) {
          attrs.organizer = {
            name: event.organizer,
            email: "admin@siliconharbour.dev",
          };
        }

        icsEvents.push(attrs);
        isFirst = false;
      }
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
