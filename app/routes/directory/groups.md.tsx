import type { Route } from "./+types/groups.md";
import { getPaginatedGroups } from "~/lib/groups.server";
import { buildMarkdownListResponse } from "~/lib/markdown-route.server";
import { parseMarkdownListParams } from "~/lib/public-query.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { limit, offset, searchQuery } = parseMarkdownListParams(new URL(request.url));

  const { items, total } = await getPaginatedGroups(limit, offset, searchQuery);

  return buildMarkdownListResponse({
    request,
    title: "Groups",
    description: "Meetups and community groups in the St. John's tech scene.",
    items: items.map((g) => ({ slug: g.slug, name: g.name, description: g.description })),
    entityType: "group",
    basePath: "/directory/groups",
    total,
  });
}
