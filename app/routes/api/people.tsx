import type { Route } from "./+types/people";
import { db } from "~/db";
import { people } from "~/db/schema";
import { asc, count, eq } from "drizzle-orm";
import {
  parsePagination,
  paginatedJsonResponse,
  imageUrl,
  contentUrl,
} from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url);

  const [{ total }] = await db
    .select({ total: count() })
    .from(people)
    .where(eq(people.visible, true));

  const data = await db
    .select()
    .from(people)
    .where(eq(people.visible, true))
    .orderBy(asc(people.name))
    .limit(limit)
    .offset(offset);

  const items = data.map((person) => ({
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
  }));

  return paginatedJsonResponse(url, items, { total, limit, offset });
}
