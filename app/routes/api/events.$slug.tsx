import type { Route } from "./+types/events.$slug";
import { db } from "~/db";
import { events, eventDates } from "~/db/schema";
import { eq, asc } from "drizzle-orm";
import { jsonResponse, imageUrl, contentUrl } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.slug, params.slug));
  
  if (!event) {
    return jsonResponse({ error: "Event not found" }, { status: 404 });
  }
  
  const dates = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, event.id))
    .orderBy(asc(eventDates.startDate));
  
  return jsonResponse({
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    organizer: event.organizer,
    location: event.location,
    link: event.link,
    coverImage: imageUrl(event.coverImage),
    dates: dates.map(d => ({
      startDate: d.startDate.toISOString(),
      endDate: d.endDate?.toISOString() || null,
    })),
    url: contentUrl("events", event.slug),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  });
}
