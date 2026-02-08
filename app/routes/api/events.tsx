import type { Route } from "./+types/events";
import { db } from "~/db";
import { events, eventDates } from "~/db/schema";
import { asc, count } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const [{ total }] = await db.select({ total: count() }).from(events);
    const eventsPage = await db
      .select()
      .from(events)
      .orderBy(asc(events.title))
      .limit(limit)
      .offset(offset);

    const eventIds = eventsPage.map((event) => event.id);
    const allDates =
      eventIds.length > 0
        ? await db.select().from(eventDates).orderBy(asc(eventDates.startDate))
        : [];

    const datesMap = new Map<number, typeof allDates>();
    for (const date of allDates) {
      if (!eventIds.includes(date.eventId)) continue;
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
      dates: (datesMap.get(event.id) || []).map((date) => ({
        startDate: date.startDate.toISOString(),
        endDate: date.endDate?.toISOString() || null,
      })),
      url: contentUrl("events", event.slug),
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    }));

    return { items, total };
  },
  mapItem: (item) => item,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
