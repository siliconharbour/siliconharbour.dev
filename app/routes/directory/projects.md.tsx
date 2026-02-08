import type { Route } from "./+types/projects.md";
import { getPaginatedProjects } from "~/lib/projects.server";
import { buildMarkdownListResponse } from "~/lib/markdown-route.server";
import { parseMarkdownListParams } from "~/lib/public-query.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { limit, offset, searchQuery } = parseMarkdownListParams(new URL(request.url));

  const { items, total } = await getPaginatedProjects(limit, offset, searchQuery);

  return buildMarkdownListResponse({
    request,
    title: "Projects",
    description: "Open source and community projects from St. John's.",
    items: items.map((p) => ({ slug: p.slug, name: p.name, description: p.description })),
    entityType: "project",
    basePath: "/directory/projects",
    total,
  });
}
