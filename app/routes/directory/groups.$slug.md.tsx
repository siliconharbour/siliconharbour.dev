import type { Route } from "./+types/groups.$slug.md";
import { getGroupBySlug } from "~/lib/groups.server";
import { markdownResponse, groupToMarkdown } from "~/lib/markdown.server";

export async function loader({ params }: Route.LoaderArgs) {
  const group = await getGroupBySlug(params.slug);
  if (!group) {
    throw new Response("Group not found", { status: 404 });
  }

  return markdownResponse(groupToMarkdown(group));
}
