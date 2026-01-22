import type { Route } from "./+types/about.md";
import { getRawContent } from "~/lib/content.server";
import { markdownResponse } from "~/lib/markdown.server";

export async function loader({}: Route.LoaderArgs) {
  const content = getRawContent("about");
  return markdownResponse(content);
}
