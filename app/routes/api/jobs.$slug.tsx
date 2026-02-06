import type { Route } from "./+types/jobs.$slug";
import { db } from "~/db";
import { jobs, companies } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, contentUrl } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const [result] = await db
    .select({
      job: jobs,
      companyName: companies.name,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.slug, params.slug));

  if (!result) {
    return jsonResponse({ error: "Job not found" }, { status: 404 });
  }

  const { job, companyName } = result;

  return jsonResponse({
    id: job.id,
    slug: job.slug,
    title: job.title,
    description: job.description || job.descriptionText,
    companyName: companyName,
    location: job.location,
    department: job.department,
    workplaceType: job.workplaceType,
    salaryRange: job.salaryRange,
    url: job.url,
    postedAt: job.postedAt?.toISOString() || null,
    detailUrl: job.slug ? contentUrl("jobs", job.slug) : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
}
