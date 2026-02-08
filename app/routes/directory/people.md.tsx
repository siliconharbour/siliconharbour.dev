import type { Route } from "./+types/people.md";
import { getPaginatedPeople } from "~/lib/people.server";
import { buildMarkdownListResponse } from "~/lib/markdown-route.server";
import { parseMarkdownListParams } from "~/lib/public-query.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { limit, offset, searchQuery } = parseMarkdownListParams(new URL(request.url));

  const { items, total } = await getPaginatedPeople(limit, offset, searchQuery);

  return buildMarkdownListResponse({
    request,
    title: "People",
    description: "Developers and builders in the St. John's tech community.",
    items: items.map((p) => ({ slug: p.slug, name: p.name, description: p.bio })),
    entityType: "person",
    basePath: "/directory/people",
    total,
  });
}
