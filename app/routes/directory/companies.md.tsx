import type { Route } from "./+types/companies.md";
import { getPaginatedCompanies } from "~/lib/companies.server";
import { buildMarkdownListResponse } from "~/lib/markdown-route.server";
import { parseMarkdownListParams } from "~/lib/public-query.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { limit, offset, searchQuery } = parseMarkdownListParams(new URL(request.url));

  const { items, total } = await getPaginatedCompanies(limit, offset, searchQuery);

  return buildMarkdownListResponse({
    request,
    title: "Companies",
    description: "Local tech companies in St. John's, Newfoundland & Labrador.",
    items: items.map((c) => ({ slug: c.slug, name: c.name, description: c.description })),
    entityType: "company",
    basePath: "/directory/companies",
    total,
  });
}
