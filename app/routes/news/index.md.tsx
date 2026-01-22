import type { Route } from "./+types/index.md";
import { getPaginatedNews } from "~/lib/news.server";
import { markdownResponse, listPageToMarkdown } from "~/lib/markdown.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
  const searchQuery = url.searchParams.get("q") || "";

  const { items, total } = await getPaginatedNews(limit, offset, searchQuery);

  const content = listPageToMarkdown({
    title: "News",
    description: "Community news and updates from the St. John's tech scene.",
    items: items.map(n => ({ slug: n.slug, name: n.title, description: n.excerpt || n.content })),
    entityType: "news",
    basePath: "/news",
    total,
    limit,
    offset,
    searchQuery,
  });

  return markdownResponse(content);
}
