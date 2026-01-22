import type { Route } from "./+types/people.$slug.md";
import { getPersonBySlug } from "~/lib/people.server";
import { markdownResponse, personToMarkdown } from "~/lib/markdown.server";

export async function loader({ params }: Route.LoaderArgs) {
  const person = await getPersonBySlug(params.slug);
  if (!person) {
    throw new Response("Person not found", { status: 404 });
  }

  return markdownResponse(personToMarkdown(person));
}
