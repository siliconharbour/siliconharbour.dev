import type { Route } from "./+types/education";
import { db } from "~/db";
import { education } from "~/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";

const mapEducation = (inst: typeof education.$inferSelect) => ({
  id: inst.id,
  slug: inst.slug,
  name: inst.name,
  description: inst.description,
  type: inst.type,
  website: inst.website,
  logo: imageUrl(inst.logo),
  coverImage: imageUrl(inst.coverImage),
  url: contentUrl("education", inst.slug),
  createdAt: inst.createdAt.toISOString(),
  updatedAt: inst.updatedAt.toISOString(),
});

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(education)
      .where(eq(education.visible, true));

    const items = await db
      .select()
      .from(education)
      .where(eq(education.visible, true))
      .orderBy(asc(education.name))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },
  mapItem: mapEducation,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
