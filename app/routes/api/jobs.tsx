import type { Route } from "./+types/jobs";
import { db } from "~/db";
import { jobs, companies } from "~/db/schema";
import { desc, count, eq } from "drizzle-orm";
import { parsePagination, buildLinkHeader, jsonResponse, contentUrl } from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url);

  // Only count/return active jobs
  const activeCondition = eq(jobs.status, "active");

  const [{ total }] = await db.select({ total: count() }).from(jobs).where(activeCondition);

  const data = await db
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

  const items = data.map(({ job, companyName }) => ({
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
  }));

  const baseUrl = url.origin + url.pathname;
  const linkHeader = buildLinkHeader(baseUrl, { limit, offset }, total);

  return jsonResponse(
    {
      data: items,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    },
    { linkHeader },
  );
}
