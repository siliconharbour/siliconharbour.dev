import type { Route } from "./+types/projects.$slug.md";
import { getProjectBySlug } from "~/lib/projects.server";
import { markdownResponse, projectToMarkdown } from "~/lib/markdown.server";

export async function loader({ params }: Route.LoaderArgs) {
  const project = await getProjectBySlug(params.slug);
  if (!project) {
    throw new Response("Project not found", { status: 404 });
  }

  return markdownResponse(projectToMarkdown(project));
}
