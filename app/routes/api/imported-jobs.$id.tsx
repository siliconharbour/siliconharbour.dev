import type { Route } from "./+types/imported-jobs.$id";
import { db } from "~/db";
import { importedJobs, companies, jobImportSources } from "~/db/schema";
import { eq } from "drizzle-orm";
import { jsonResponse, contentUrl, notFoundResponse } from "~/lib/api.server";

export async function loader({ params }: Route.LoaderArgs) {
  const jobId = Number(params.id);
  if (!jobId || isNaN(jobId)) {
    return notFoundResponse("Job not found");
  }

  // Get job with company and source info
  const [result] = await db
    .select({
      job: importedJobs,
      company: {
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        logo: companies.logo,
      },
      source: {
        sourceType: jobImportSources.sourceType,
        sourceIdentifier: jobImportSources.sourceIdentifier,
      },
    })
    .from(importedJobs)
    .innerJoin(companies, eq(importedJobs.companyId, companies.id))
    .innerJoin(jobImportSources, eq(importedJobs.sourceId, jobImportSources.id))
    .where(eq(importedJobs.id, jobId))
    .limit(1);

  if (!result) {
    return notFoundResponse("Job not found");
  }

  const { job, company, source } = result;

  return jsonResponse({
    id: job.id,
    externalId: job.externalId,
    title: job.title,
    location: job.location,
    department: job.department,
    workplaceType: job.workplaceType,
    url: job.url,
    descriptionText: job.descriptionText,
    status: job.status,
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      url: contentUrl("directory/companies", company.slug),
    },
    source: {
      type: source.sourceType,
      identifier: source.sourceIdentifier,
    },
    firstSeenAt: job.firstSeenAt.toISOString(),
    lastSeenAt: job.lastSeenAt.toISOString(),
    postedAt: job.postedAt?.toISOString() || null,
    removedAt: job.removedAt?.toISOString() || null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
}
