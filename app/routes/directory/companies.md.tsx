import type { Route } from "./+types/companies.md";
import { getPaginatedCompanies } from "~/lib/companies.server";
import { markdownResponse, listPageToMarkdown } from "~/lib/markdown.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
  const searchQuery = url.searchParams.get("q") || "";

  const { items, total } = await getPaginatedCompanies(limit, offset, searchQuery);

  const content = listPageToMarkdown({
    title: "Companies",
    description: "Local tech companies in St. John's, Newfoundland & Labrador.",
    items: items.map((c) => ({ slug: c.slug, name: c.name, description: c.description })),
    entityType: "company",
    basePath: "/directory/companies",
    total,
    limit,
    offset,
    searchQuery,
  });

  return markdownResponse(content);
}
