import type { Route } from "./+types/education.$slug.md";
import { getEducationBySlug } from "~/lib/education.server";
import { markdownResponse, educationToMarkdown } from "~/lib/markdown.server";

export async function loader({ params }: Route.LoaderArgs) {
  const edu = await getEducationBySlug(params.slug);
  if (!edu) {
    throw new Response("Education not found", { status: 404 });
  }

  return markdownResponse(educationToMarkdown(edu));
}
