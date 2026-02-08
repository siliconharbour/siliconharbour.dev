import type { Route } from "./+types/index.md";
import { getPaginatedEvents, type EventFilter } from "~/lib/events.server";
import { buildMarkdownListResponse } from "~/lib/markdown-route.server";
import { parseMarkdownListParams } from "~/lib/public-query.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset, searchQuery } = parseMarkdownListParams(url);
  const filter = (url.searchParams.get("filter") || "upcoming") as EventFilter;

  const { items, total } = await getPaginatedEvents(limit, offset, searchQuery, filter);

  return buildMarkdownListResponse({
    request,
    title: "Events",
    description: "Tech events, meetups, and workshops in St. John's.",
    items: items.map((e) => ({ slug: e.slug, name: e.title, description: e.description })),
    entityType: "event",
    basePath: "/events",
    total,
  });
}
