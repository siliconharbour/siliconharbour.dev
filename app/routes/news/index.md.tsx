import type { Route } from "./+types/index.md";
import { getPaginatedNews } from "~/lib/news.server";
import { buildMarkdownListResponse } from "~/lib/markdown-route.server";
import { parseMarkdownListParams } from "~/lib/public-query.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { limit, offset, searchQuery } = parseMarkdownListParams(new URL(request.url));

  const { items, total } = await getPaginatedNews(limit, offset, searchQuery);

  return buildMarkdownListResponse({
    request,
    title: "News",
    description: "Community news and updates from the St. John's tech scene.",
    items: items.map((n) => ({ slug: n.slug, name: n.title, description: n.excerpt || n.content })),
    entityType: "news",
    basePath: "/news",
    total,
  });
}
