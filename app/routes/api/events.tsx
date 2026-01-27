import type { Route } from "./+types/events";
import { db } from "~/db";
import { events, eventDates } from "~/db/schema";
import { asc, count } from "drizzle-orm";
import {
  parsePagination,
  buildLinkHeader,
  jsonResponse,
  imageUrl,
  contentUrl,
} from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url);

  // Get total count
  const [{ total }] = await db.select({ total: count() }).from(events);

  // Get paginated events
  const data = await db
    .select()
    .from(events)
    .orderBy(asc(events.title))
    .limit(limit)
    .offset(offset);

  // Get all dates for these events
  const eventIds = data.map((e) => e.id);
  const allDates =
    eventIds.length > 0
      ? await db.select().from(eventDates).orderBy(asc(eventDates.startDate))
      : [];

  const datesMap = new Map<number, typeof allDates>();
  for (const date of allDates) {
    if (eventIds.includes(date.eventId)) {
      if (!datesMap.has(date.eventId)) {
        datesMap.set(date.eventId, []);
      }
      datesMap.get(date.eventId)!.push(date);
    }
  }

  const items = data.map((event) => ({
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    organizer: event.organizer,
    location: event.location,
    link: event.link,
    coverImage: imageUrl(event.coverImage),
    dates: (datesMap.get(event.id) || []).map((d) => ({
      startDate: d.startDate.toISOString(),
      endDate: d.endDate?.toISOString() || null,
    })),
    url: contentUrl("events", event.slug),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }));

  const baseUrl = url.origin + url.pathname;
  const linkHeader = buildLinkHeader(baseUrl, { limit, offset }, total);

  return jsonResponse(
    {
      data: items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    },
    { linkHeader },
  );
}
