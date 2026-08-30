import type { Route } from "./+types/events.$slug";
import { db } from "~/db";
import { events, eventDates } from "~/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";
import { eventRecurrence } from "~/lib/events-api.server";
import { getTagsForEvents } from "~/lib/event-tags.server";
import { publiclyVisibleEvent } from "~/lib/event-visibility";

const mapEvent = async (event: typeof events.$inferSelect) => {
  const dates = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, event.id))
    .orderBy(asc(eventDates.startDate));
  const tags = (await getTagsForEvents([event.id])).get(event.id) ?? [];
  const parent = event.parentEventId
    ? await db
        .select()
        .from(events)
        .where(and(eq(events.id, event.parentEventId), publiclyVisibleEvent))
        .get()
    : null;
  const children = await db
    .select({ id: events.id, slug: events.slug, title: events.title, timeMode: events.timeMode })
    .from(events)
    .where(and(eq(events.parentEventId, event.id), publiclyVisibleEvent));

  return {
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
    tags,
    parent: parent ? { id: parent.id, slug: parent.slug, title: parent.title } : null,
    schedule: children,
    dates: dates.map((d) => ({
      startDate: d.startDate.toISOString(),
      endDate: d.endDate?.toISOString() || null,
    })),
    recurrence: eventRecurrence(event),
    url: contentUrl("events", event.slug),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
};

export const loader = createDetailApiLoader({
  entityName: "Event",
  loadBySlug: async (slug) => {
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.slug, slug), publiclyVisibleEvent));
    return event ?? null;
  },
  mapEntity: mapEvent,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
