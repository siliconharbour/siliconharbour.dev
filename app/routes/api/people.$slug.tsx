import type { Route } from "./+types/people.$slug";
import { db } from "~/db";
import { people } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, imageUrl, contentUrl, notFoundResponse } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [person] = await db.select().from(people).where(eq(people.slug, params.slug));

  if (!person) {
    return notFoundResponse("Person not found");
  }

  return jsonResponse({
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
}
