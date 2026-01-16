import type { Route } from "./+types/jobs.$slug";
import { db } from "~/db";
import { jobs } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, contentUrl } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.slug, params.slug));
  
  if (!job) {
    return jsonResponse({ error: "Job not found" }, { status: 404 });
  }
  
  return jsonResponse({
    id: job.id,
    slug: job.slug,
    title: job.title,
    description: job.description,
    companyName: job.companyName,
    location: job.location,
    remote: job.remote,
    salaryRange: job.salaryRange,
    applyLink: job.applyLink,
    postedAt: job.postedAt.toISOString(),
    expiresAt: job.expiresAt?.toISOString() || null,
    url: contentUrl("jobs", job.slug),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
}
