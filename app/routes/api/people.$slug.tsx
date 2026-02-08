import type { Route } from "./+types/people.$slug";
import { db } from "~/db";
import { people } from "~/db/schema";
import { eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";

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

export const loader = createDetailApiLoader({
  entityName: "Person",
  loadBySlug: async (slug) => {
    const [person] = await db.select().from(people).where(eq(people.slug, slug));
    return person ?? null;
  },
  mapEntity: mapPerson,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
