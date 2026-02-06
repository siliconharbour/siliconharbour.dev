import type { Route } from "./+types/imported-jobs";
import { db } from "~/db";
import { importedJobs, companies } from "~/db/schema";
import { asc, count, eq, and } from "drizzle-orm";
import {
  parsePagination,
  buildLinkHeader,
  jsonResponse,
  contentUrl,
} from "~/lib/api.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url);
  const companySlug = url.searchParams.get("company");

  // Base query conditions - only active jobs
  let conditions = eq(importedJobs.status, "active");

  // If filtering by company slug, join to get company
  let companyId: number | null = null;
  if (companySlug) {
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, companySlug))
      .limit(1);
    if (company) {
      companyId = company.id;
      conditions = and(conditions, eq(importedJobs.companyId, companyId))!;
    }
  }

  // Get total count
  const [{ total }] = await db
    .select({ total: count() })
    .from(importedJobs)
    .where(conditions);

  // Get paginated data with company info
  const data = await db
    .select({
      job: importedJobs,
      company: {
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        logo: companies.logo,
      },
    })
    .from(importedJobs)
    .innerJoin(companies, eq(importedJobs.companyId, companies.id))
    .where(conditions)
    .orderBy(asc(importedJobs.title))
    .limit(limit)
    .offset(offset);

  // Transform data for API response
  const items = data.map(({ job, company }) => ({
    id: job.id,
    externalId: job.externalId,
    title: job.title,
    location: job.location,
    department: job.department,
    workplaceType: job.workplaceType,
    url: job.url,
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      url: contentUrl("directory/companies", company.slug),
    },
    firstSeenAt: job.firstSeenAt.toISOString(),
    lastSeenAt: job.lastSeenAt.toISOString(),
    postedAt: job.postedAt?.toISOString() || null,
  }));

  const baseUrl = url.origin + url.pathname;
  const linkHeader = buildLinkHeader(baseUrl, { limit, offset }, total);

  return jsonResponse(
    {
      data: items,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    },
    { linkHeader },
  );
}
