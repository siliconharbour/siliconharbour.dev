import type { Route } from "./+types/projects.$slug";
import { db } from "~/db";
import { projects } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, imageUrl, contentUrl } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, params.slug));
  
  if (!project) {
    return jsonResponse({ error: "Project not found" }, { status: 404 });
  }
  
  return jsonResponse({
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
}
