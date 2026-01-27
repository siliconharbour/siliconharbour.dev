import type { Route } from "./+types/groups.md";
import { getPaginatedGroups } from "~/lib/groups.server";
import { markdownResponse, listPageToMarkdown } from "~/lib/markdown.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
  const searchQuery = url.searchParams.get("q") || "";

  const { items, total } = await getPaginatedGroups(limit, offset, searchQuery);

  const content = listPageToMarkdown({
    title: "Groups",
    description: "Meetups and community groups in the St. John's tech scene.",
    items: items.map((g) => ({ slug: g.slug, name: g.name, description: g.description })),
    entityType: "group",
    basePath: "/directory/groups",
    total,
    limit,
    offset,
    searchQuery,
  });

  return markdownResponse(content);
}
