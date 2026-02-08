import type { Route } from "./+types/products.md";
import { getPaginatedProducts } from "~/lib/products.server";
import { buildMarkdownListResponse } from "~/lib/markdown-route.server";
import { parseMarkdownListParams } from "~/lib/public-query.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { limit, offset, searchQuery } = parseMarkdownListParams(new URL(request.url));

  const { items, total } = await getPaginatedProducts(limit, offset, searchQuery);

  return buildMarkdownListResponse({
    request,
    title: "Products",
    description: "Products built by companies in St. John's.",
    items: items.map((p) => ({ slug: p.slug, name: p.name, description: p.description })),
    entityType: "product",
    basePath: "/directory/products",
    total,
  });
}
