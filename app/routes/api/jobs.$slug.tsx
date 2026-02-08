import type { Route } from "./+types/jobs.$slug";
import { db } from "~/db";
import { jobs, companies } from "~/db/schema";
import { eq } from "drizzle-orm";
import { contentUrl } from "~/lib/api.server";
import { createDetailApiLoader } from "~/lib/api-route.server";

const mapJob = ({ job, companyName }: { job: typeof jobs.$inferSelect; companyName: string | null }) => {
  return {
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
  };
};

export const loader = createDetailApiLoader({
  entityName: "Job",
  loadBySlug: async (slug) => {
    const [result] = await db
      .select({
        job: jobs,
        companyName: companies.name,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(eq(jobs.slug, slug));
    return result ?? null;
  },
  mapEntity: mapJob,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
