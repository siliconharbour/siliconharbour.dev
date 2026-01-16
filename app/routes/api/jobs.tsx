import type { Route } from "./+types/jobs";
import { db } from "~/db";
import { jobs } from "~/db/schema";
import { desc, count, or, isNull, gte } from "drizzle-orm";
import { parsePagination, buildLinkHeader, jsonResponse, contentUrl } from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url);
  const now = new Date();
  
  // Only count/return active jobs (not expired)
  const activeCondition = or(isNull(jobs.expiresAt), gte(jobs.expiresAt, now));
  
  const [{ total }] = await db
    .select({ total: count() })
    .from(jobs)
    .where(activeCondition);
  
  const data = await db
    .select()
    .from(jobs)
    .where(activeCondition)
    .orderBy(desc(jobs.postedAt))
    .limit(limit)
    .offset(offset);
  
  const items = data.map(job => ({
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
  }));
  
  const baseUrl = url.origin + url.pathname;
  const linkHeader = buildLinkHeader(baseUrl, { limit, offset }, total);
  
  return jsonResponse({
    data: items,
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  }, { linkHeader });
}
