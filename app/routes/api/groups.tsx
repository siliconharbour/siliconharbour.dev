import type { Route } from "./+types/groups";
import { db } from "~/db";
import { groups } from "~/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";

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

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(groups)
      .where(eq(groups.visible, true));

    const items = await db
      .select()
      .from(groups)
      .where(eq(groups.visible, true))
      .orderBy(asc(groups.name))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },
  mapItem: mapGroup,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
