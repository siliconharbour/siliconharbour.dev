import type { Route } from "./+types/projects.md";
import { getPaginatedProjects } from "~/lib/projects.server";
import { markdownResponse, listPageToMarkdown } from "~/lib/markdown.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
  const searchQuery = url.searchParams.get("q") || "";

  const { items, total } = await getPaginatedProjects(limit, offset, searchQuery);

  const content = listPageToMarkdown({
    title: "Projects",
    description: "Open source and community projects from St. John's.",
    items: items.map((p) => ({ slug: p.slug, name: p.name, description: p.description })),
    entityType: "project",
    basePath: "/directory/projects",
    total,
    limit,
    offset,
    searchQuery,
  });

  return markdownResponse(content);
}
