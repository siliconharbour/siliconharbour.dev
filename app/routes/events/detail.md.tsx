import type { Route } from "./+types/detail.md";
import { getPublicEventBySlug } from "~/lib/events.server";
import { markdownResponse, eventToMarkdown } from "~/lib/markdown.server";

export async function loader({ params }: Route.LoaderArgs) {
  const event = await getPublicEventBySlug(params.slug);
  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  return markdownResponse(eventToMarkdown(event));
}
