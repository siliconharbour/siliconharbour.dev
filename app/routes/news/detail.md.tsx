import type { Route } from "./+types/detail.md";
import { getNewsBySlug } from "~/lib/news.server";
import { markdownResponse, newsToMarkdown } from "~/lib/markdown.server";

export async function loader({ params }: Route.LoaderArgs) {
  const article = await getNewsBySlug(params.slug);
  if (!article) {
    throw new Response("News article not found", { status: 404 });
  }

  return markdownResponse(newsToMarkdown(article));
}
