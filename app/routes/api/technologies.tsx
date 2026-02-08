import type { Route } from "./+types/technologies";
import { db } from "~/db";
import { technologies } from "~/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";

const mapTechnology = (tech: typeof technologies.$inferSelect) => ({
  id: tech.id,
  slug: tech.slug,
  name: tech.name,
  category: tech.category,
  description: tech.description,
  website: tech.website,
  icon: imageUrl(tech.icon),
  url: contentUrl("directory/technologies", tech.slug),
  createdAt: tech.createdAt.toISOString(),
  updatedAt: tech.updatedAt.toISOString(),
});

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(technologies)
      .where(eq(technologies.visible, true));

    const items = await db
      .select()
      .from(technologies)
      .where(eq(technologies.visible, true))
      .orderBy(asc(technologies.name))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },
  mapItem: mapTechnology,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
