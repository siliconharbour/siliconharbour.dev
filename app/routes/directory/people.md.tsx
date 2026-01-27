import type { Route } from "./+types/people.md";
import { getPaginatedPeople } from "~/lib/people.server";
import { markdownResponse, listPageToMarkdown } from "~/lib/markdown.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
  const searchQuery = url.searchParams.get("q") || "";

  const { items, total } = await getPaginatedPeople(limit, offset, searchQuery);

  const content = listPageToMarkdown({
    title: "People",
    description: "Developers and builders in the St. John's tech community.",
    items: items.map((p) => ({ slug: p.slug, name: p.name, description: p.bio })),
    entityType: "person",
    basePath: "/directory/people",
    total,
    limit,
    offset,
    searchQuery,
  });

  return markdownResponse(content);
}
