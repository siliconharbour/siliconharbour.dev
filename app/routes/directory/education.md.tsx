import type { Route } from "./+types/education.md";
import { getPaginatedEducation } from "~/lib/education.server";
import { markdownResponse, listPageToMarkdown } from "~/lib/markdown.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
  const searchQuery = url.searchParams.get("q") || "";

  const { items, total } = await getPaginatedEducation(limit, offset, searchQuery);

  const content = listPageToMarkdown({
    title: "Education",
    description: "Educational institutions and programs in Newfoundland & Labrador.",
    items: items.map((e) => ({ slug: e.slug, name: e.name, description: e.description })),
    entityType: "education",
    basePath: "/directory/education",
    total,
    limit,
    offset,
    searchQuery,
  });

  return markdownResponse(content);
}
