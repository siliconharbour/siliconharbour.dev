import type { Route } from "./+types/jobs";
import { db } from "~/db";
import { jobs, companies } from "~/db/schema";
import { desc, count, eq } from "drizzle-orm";
import { contentUrl } from "~/lib/api.server";
import { createPaginatedApiLoader } from "~/lib/api-route.server";

export const loader = createPaginatedApiLoader({
  loadPage: async ({ limit, offset }) => {
    const activeCondition = eq(jobs.status, "active");
    const [{ total }] = await db.select({ total: count() }).from(jobs).where(activeCondition);

    const rows = await db
      .select({
        job: jobs,
        companyName: companies.name,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(activeCondition)
      .orderBy(desc(jobs.postedAt))
      .limit(limit)
      .offset(offset);

    const items = rows.map(({ job, companyName }) => ({
      id: job.id,
      slug: job.slug,
      title: job.title,
      description: job.description || job.descriptionText,
      companyName,
      location: job.location,
      department: job.department,
      workplaceType: job.workplaceType,
      salaryRange: job.salaryRange,
      url: job.url,
      postedAt: job.postedAt?.toISOString() || null,
      detailUrl: job.slug ? contentUrl("jobs", job.slug) : null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }));

    return { items, total };
  },
  mapItem: (item) => item,
}) satisfies (args: Route.LoaderArgs) => Promise<Response>;
