import type { Route } from "./+types/groups.$slug";
import { db } from "~/db";
import { groups } from "~/db/schema";
import { eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";

const mapGroup = (group: typeof groups.$inferSelect) => ({
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

export const loader = createDetailApiLoader({
  entityName: "Group",
  loadBySlug: async (slug) => {
    const [group] = await db.select().from(groups).where(eq(groups.slug, slug));
    return group ?? null;
  },
  mapEntity: mapGroup,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
