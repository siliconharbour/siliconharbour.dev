import type { Route } from "./+types/index.md";
import { getPaginatedEvents, type EventFilter } from "~/lib/events.server";
import { markdownResponse, listPageToMarkdown } from "~/lib/markdown.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
  const searchQuery = url.searchParams.get("q") || "";
  const filter = (url.searchParams.get("filter") || "upcoming") as EventFilter;

  const { items, total } = await getPaginatedEvents(limit, offset, searchQuery, filter);

  const content = listPageToMarkdown({
    title: "Events",
    description: "Tech events, meetups, and workshops in St. John's.",
    items: items.map((e) => ({ slug: e.slug, name: e.title, description: e.description })),
    entityType: "event",
    basePath: "/events",
    total,
    limit,
    offset,
    searchQuery,
  });

  return markdownResponse(content);
}
