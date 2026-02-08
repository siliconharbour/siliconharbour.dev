import type { Route } from "./+types/people";
import { db } from "~/db";
import { people } from "~/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";

const mapPerson = (person: typeof people.$inferSelect) => ({
  id: person.id,
  slug: person.slug,
  name: person.name,
  bio: person.bio,
  website: person.website,
  avatar: imageUrl(person.avatar),
  socialLinks: person.socialLinks ? JSON.parse(person.socialLinks) : null,
  url: contentUrl("people", person.slug),
  createdAt: person.createdAt.toISOString(),
  updatedAt: person.updatedAt.toISOString(),
});

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(people)
      .where(eq(people.visible, true));

    const items = await db
      .select()
      .from(people)
      .where(eq(people.visible, true))
      .orderBy(asc(people.name))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },
  mapItem: mapPerson,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
