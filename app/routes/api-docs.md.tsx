import type { Route } from "./+types/api-docs.md";
import { getRawContent } from "~/lib/content.server";
import { markdownResponse } from "~/lib/markdown.server";

export async function loader({}: Route.LoaderArgs) {
  const content = getRawContent("api-docs");
  return markdownResponse(content);
}
