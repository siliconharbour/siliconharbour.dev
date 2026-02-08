import type { Route } from "./+types/education.$slug";
import { db } from "~/db";
import { education } from "~/db/schema";
import { eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";

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

export const loader = createDetailApiLoader({
  entityName: "Education resource",
  loadBySlug: async (slug) => {
    const [inst] = await db.select().from(education).where(eq(education.slug, slug));
    return inst ?? null;
  },
  mapEntity: mapEducation,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
