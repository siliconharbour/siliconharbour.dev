import type { Route } from "./+types/detail.md";
import { getJobBySlug } from "~/lib/jobs.server";
import { markdownResponse, jobToMarkdown } from "~/lib/markdown.server";

export async function loader({ params }: Route.LoaderArgs) {
  const job = await getJobBySlug(params.slug);
  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  return markdownResponse(jobToMarkdown(job));
}
