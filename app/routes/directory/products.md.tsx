import type { Route } from "./+types/products.md";
import { getPaginatedProducts } from "~/lib/products.server";
import { markdownResponse, listPageToMarkdown } from "~/lib/markdown.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
  const searchQuery = url.searchParams.get("q") || "";

  const { items, total } = await getPaginatedProducts(limit, offset, searchQuery);

  const content = listPageToMarkdown({
    title: "Products",
    description: "Products built by companies in St. John's.",
    items: items.map((p) => ({ slug: p.slug, name: p.name, description: p.description })),
    entityType: "product",
    basePath: "/directory/products",
    total,
    limit,
    offset,
    searchQuery,
  });

  return markdownResponse(content);
}
