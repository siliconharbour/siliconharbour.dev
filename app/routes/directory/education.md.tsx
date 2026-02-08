import type { Route } from "./+types/education.md";
import { getPaginatedEducation } from "~/lib/education.server";
import { buildMarkdownListResponse } from "~/lib/markdown-route.server";
import { parseMarkdownListParams } from "~/lib/public-query.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { limit, offset, searchQuery } = parseMarkdownListParams(new URL(request.url));

  const { items, total } = await getPaginatedEducation(limit, offset, searchQuery);

  return buildMarkdownListResponse({
    request,
    title: "Education",
    description: "Educational institutions and programs in Newfoundland & Labrador.",
    items: items.map((e) => ({ slug: e.slug, name: e.name, description: e.description })),
    entityType: "education",
    basePath: "/directory/education",
    total,
  });
}
