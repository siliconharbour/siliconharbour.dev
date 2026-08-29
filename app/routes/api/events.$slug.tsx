import type { Route } from "./+types/events.$slug";
import { db } from "~/db";
import { events, eventDates } from "~/db/schema";
import { and, eq, asc, or, isNull } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";
import { eventRecurrence } from "~/lib/events-api.server";

const mapEvent = async (event: typeof events.$inferSelect) => {
  const dates = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, event.id))
    .orderBy(asc(eventDates.startDate));
  const parent = event.parentEventId
    ? await db.select().from(events).where(eq(events.id, event.parentEventId)).get()
    : null;
  const children = await db
    .select({ id: events.id, slug: events.slug, title: events.title, timeMode: events.timeMode })
    .from(events)
    .where(and(eq(events.parentEventId, event.id), isPubliclyVisible));

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

// Public-safe filter: manual events (importStatus IS NULL) or published imports.
// Hides imports that are pending_review, hidden, or anything else.
const isPubliclyVisible = or(isNull(events.importStatus), eq(events.importStatus, "published"));

export const loader = createDetailApiLoader({
  entityName: "Event",
  loadBySlug: async (slug) => {
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.slug, slug), isPubliclyVisible));
    return event ?? null;
  },
  mapEntity: mapEvent,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
