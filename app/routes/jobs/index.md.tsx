import type { Route } from "./+types/index.md";
import { getPaginatedJobs } from "~/lib/jobs.server";
import { markdownResponse, listPageToMarkdown } from "~/lib/markdown.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
  const searchQuery = url.searchParams.get("q") || "";

  const { items, total } = await getPaginatedJobs(limit, offset, searchQuery);

  const content = listPageToMarkdown({
    title: "Jobs",
    description: "Tech job opportunities in St. John's and Newfoundland & Labrador.",
    items: items.map(j => ({ slug: j.slug, name: j.title, description: j.description })),
    entityType: "job",
    basePath: "/jobs",
    total,
    limit,
    offset,
    searchQuery,
  });

  return markdownResponse(content);
}
