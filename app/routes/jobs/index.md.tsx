import type { Route } from "./+types/index.md";
import { getPaginatedJobs } from "~/lib/jobs.server";
import { buildMarkdownListResponse } from "~/lib/markdown-route.server";
import { parseMarkdownListParams } from "~/lib/public-query.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { limit, offset, searchQuery } = parseMarkdownListParams(new URL(request.url));

  const { items, total } = await getPaginatedJobs(limit, offset, searchQuery);

  return buildMarkdownListResponse({
    request,
    title: "Jobs",
    description: "Tech job opportunities in St. John's and Newfoundland & Labrador.",
    items: items.map((j) => ({
      slug: j.slug,
      url: j.url,
      name: j.title,
      description: j.description || j.descriptionText || undefined,
    })),
    entityType: "job",
    basePath: "/jobs",
    apiPath: "/api/jobs",
    total,
  });
}
