import type { Route } from "./+types/projects";
import { db } from "~/db";
import { projects } from "~/db/schema";
import { asc, count } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";

const mapProject = (project: typeof projects.$inferSelect) => ({
  id: project.id,
  slug: project.slug,
  name: project.name,
  description: project.description,
  type: project.type,
  status: project.status,
  links: project.links ? JSON.parse(project.links) : null,
  logo: imageUrl(project.logo),
  coverImage: imageUrl(project.coverImage),
  url: contentUrl("projects", project.slug),
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
});

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const [{ total }] = await db.select({ total: count() }).from(projects);

    const items = await db
      .select()
      .from(projects)
      .orderBy(asc(projects.name))
      .limit(limit)
      .offset(offset);

    return { items, total };
  },
  mapItem: mapProject,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
