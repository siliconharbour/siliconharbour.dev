import type { Route } from "./+types/groups.$slug";
import { db } from "~/db";
import { groups } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, imageUrl, contentUrl, notFoundResponse } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [group] = await db.select().from(groups).where(eq(groups.slug, params.slug));

  if (!group) {
    return notFoundResponse("Group not found");
  }

  return jsonResponse({
    id: group.id,
    slug: group.slug,
    name: group.name,
    description: group.description,
    website: group.website,
    meetingFrequency: group.meetingFrequency,
    logo: imageUrl(group.logo),
    coverImage: imageUrl(group.coverImage),
    url: contentUrl("groups", group.slug),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  });
}
