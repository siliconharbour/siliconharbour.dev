import type { Route } from "./+types/projects.$slug";
import { db } from "~/db";
import { projects } from "~/db/schema";
import { eq } from "drizzle-orm";
import { imageUrl, contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";

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

export const loader = createDetailApiLoader({
  entityName: "Project",
  loadBySlug: async (slug) => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, slug));
    return project ?? null;
  },
  mapEntity: mapProject,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
