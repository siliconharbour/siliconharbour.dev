import type { Route } from "./+types/events";
import { db } from "~/db";
import { eventDates } from "~/db/schema";
import { asc, inArray } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";
import { eventRecurrence } from "~/lib/events-api.server";
import { getPaginatedEvents } from "~/lib/events.server";

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const { items: eventsPage, total } = await getPaginatedEvents(
      limit,
      offset,
      undefined,
      "all",
    );
    const eventIds = eventsPage.map((event) => event.id);
    const allDates =
      eventIds.length > 0
        ? await db
            .select()
            .from(eventDates)
            .where(inArray(eventDates.eventId, eventIds))
            .orderBy(asc(eventDates.startDate))
        : [];

    const datesMap = new Map<number, typeof allDates>();
    for (const date of allDates) {
      if (!datesMap.has(date.eventId)) {
        datesMap.set(date.eventId, []);
      }
      datesMap.get(date.eventId)!.push(date);
    }

    const items = eventsPage.map((event) => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      organizer: event.organizer,
      location: event.location,
      link: event.link,
      coverImage: imageUrl(event.coverImage),
      timeMode: event.timeMode,
      parentEventId: event.parentEventId,
      tags: event.tags ?? [],
      dates: (datesMap.get(event.id) || []).map((date) => ({
        startDate: date.startDate.toISOString(),
        endDate: date.endDate?.toISOString() || null,
      })),
      recurrence: eventRecurrence(event),
      url: contentUrl("events", event.slug),
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    }));

    return { items, total };
  },
  mapItem: (item) => item,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
