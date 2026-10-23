import { db } from "~/db";
import {
  jobs,
  companies,
  jobImportSources,
  type Job,
  type JobStatus,
  type JobSourceType,
  type NewJob,
  type WorkplaceType,
} from "~/db/schema";
import { eq, asc, desc, and, count, inArray, isNotNull, isNull, like, gte, or } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds, searchRankOrder } from "./search.server";

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: jobs.slug }).from(jobs).where(isNotNull(jobs.slug));
  return rows.map((r) => r.slug).filter((s): s is string => s !== null);
}

export async function generateJobSlug(title: string, excludeId?: number): Promise<string> {
  const baseSlug = generateSlug(title);
  let existingSlugs = await getExistingSlugs();

  if (excludeId) {
    const current = await db
      .select({ slug: jobs.slug })
      .from(jobs)
      .where(eq(jobs.id, excludeId))
      .get();
    if (current?.slug) {
      existingSlugs = existingSlugs.filter((s) => s !== current.slug);
    }
  }

  return makeSlugUnique(baseSlug, existingSlugs);
}

/**
 * Create a manual job posting
 */
export async function createJob(job: {
  title: string;
  description: string;
  companyId?: number | null;
  location?: string | null;
  department?: string | null;
  workplaceType?: "remote" | "onsite" | "hybrid" | null;
  salaryRange?: string | null;
  isTechnical?: boolean;
  url: string; // apply link
}): Promise<Job> {
  const slug = await generateJobSlug(job.title);
  const now = new Date();

  const [newJob] = await db
    .insert(jobs)
    .values({
      slug,
      title: job.title,
      description: job.description,
      companyId: job.companyId,
      location: job.location,
      department: job.department,
      workplaceType: job.workplaceType,
      salaryRange: job.salaryRange,
      url: job.url,
      isTechnical: job.isTechnical ?? true,
      sourceType: "manual",
      status: "active",
      postedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (job.description) {
    await syncReferences("job", newJob.id, job.description);
  }

  return newJob;
}

/**
 * Update a job (works for both manual and imported jobs)
 */
export async function updateJob(
  id: number,
  job: Partial<{
    title: string;
    description: string;
    companyId: number | null;
    location: string | null;
    department: string | null;
    workplaceType: "remote" | "onsite" | "hybrid" | null;
    salaryRange: string | null;
    isTechnical: boolean;
    url: string;
    status: "active" | "removed" | "filled" | "expired" | "hidden";
  }>,
): Promise<Job | null> {
  const updateData: Partial<NewJob> = { ...job, updatedAt: new Date() };

  if (job.title) {
    updateData.slug = await generateJobSlug(job.title, id);
  }

  const [updated] = await db.update(jobs).set(updateData).where(eq(jobs.id, id)).returning();

  if (!updated) return null;

  if (job.description) {
    await syncReferences("job", id, job.description);
  }

  return updated;
}

/**
 * Delete a job (hard delete - use updateJob with status for soft delete)
 */
export async function deleteJob(id: number): Promise<boolean> {
  await db.delete(jobs).where(eq(jobs.id, id));
  return true;
}

export async function getJobById(id: number): Promise<Job | null> {
  return db.select().from(jobs).where(eq(jobs.id, id)).get() ?? null;
}

export async function getJobBySlug(slug: string): Promise<Job | null> {
  return db.select().from(jobs).where(eq(jobs.slug, slug)).get() ?? null;
}

/**
 * Get all active jobs (for admin listing)
 */
export async function getAllJobs(): Promise<Job[]> {
  return db.select().from(jobs).orderBy(desc(jobs.postedAt));
}

/**
 * Get all active jobs for public display with company names
 * @param includeTechnical - if true, include only technical jobs (default: true)
 * @param includeNonTechnical - if true, include non-technical jobs (default: false)
 */
export async function getActiveJobs(options?: { includeNonTechnical?: boolean }) {
  const includeNonTechnical = options?.includeNonTechnical ?? false;

  // Build where conditions
  const conditions = [eq(jobs.status, "active")];
  if (!includeNonTechnical) {
    conditions.push(eq(jobs.isTechnical, true));
  }

  const data = await db
    .select({
      job: jobs,
      companyName: companies.name,
      companyLogo: companies.logo,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(jobs.postedAt));

  return data.map(({ job, companyName, companyLogo }) => ({
    ...job,
    companyName,
    companyLogo,
  }));
}

/**
 * Get a deterministic daily-random selection of jobs, spread across different companies.
 * Uses the same Knuth multiplicative hash seeded shuffle as companies/projects.
 */
export async function getRandomJobs(count: number, seed?: number) {
  const dateSeed = seed ?? parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ""), 10);

  const allJobs = await getActiveJobs();
  if (allJobs.length <= count) {
    return allJobs;
  }

  // Shuffle all jobs with daily seed
  const shuffled = allJobs
    .map((j) => ({
      job: j,
      hash: ((j.id + dateSeed) * 2654435761) >>> 0,
    }))
    .sort((a, b) => a.hash - b.hash);

  // Pick jobs, preferring different companies
  const picked: typeof allJobs = [];
  const seenCompanies = new Set<number | null>();

  // First pass: one job per company
  for (const { job } of shuffled) {
    if (picked.length >= count) break;
    if (!seenCompanies.has(job.companyId)) {
      seenCompanies.add(job.companyId);
      picked.push(job);
    }
  }

  // Second pass: fill remaining slots if needed
  for (const { job } of shuffled) {
    if (picked.length >= count) break;
    if (!picked.includes(job)) {
      picked.push(job);
    }
  }

  return picked;
}

// =============================================================================
// Paginated queries with search
// =============================================================================

export interface PaginatedJobs {
  items: Array<
    Job & {
      companyName: string | null;
      companyLogo: string | null;
      importSourceType: string | null;
      importSourceIdentifier: string | null;
      importSourceUrl: string | null;
    }
  >;
  total: number;
}

/** Get a filtered page of jobs with company and source summaries. */
export async function getPaginatedJobs(
  limit: number,
  offset: number,
  searchQuery?: string,
  options?: {
    includeNonTechnical?: boolean;
    searchCompanyNames?: boolean;
    companyId?: number;
    sourceId?: number | null;
    sourceType?: JobSourceType;
    status?: JobStatus | "all";
    isTechnical?: boolean;
    workplaceType?: WorkplaceType;
    location?: string;
    lastSeenAfter?: Date;
    sort?: "createdAt" | "updatedAt" | "postedAt" | "title" | "lastSeenAt";
    order?: "asc" | "desc";
  },
): Promise<PaginatedJobs> {
  const includeNonTechnical = options?.includeNonTechnical ?? false;
  const sortColumn = options?.sort
    ? {
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        postedAt: jobs.postedAt,
        title: jobs.title,
        lastSeenAt: jobs.lastSeenAt,
      }[options.sort]
    : undefined;
  const ordering = sortColumn ? (options?.order === "asc" ? asc : desc)(sortColumn) : undefined;

  // Build base conditions
  const baseConditions = [];
  if (options?.status !== "all") {
    baseConditions.push(eq(jobs.status, options?.status ?? "active"));
  }
  if (options?.isTechnical !== undefined) {
    baseConditions.push(eq(jobs.isTechnical, options.isTechnical));
  } else if (!includeNonTechnical) {
    baseConditions.push(eq(jobs.isTechnical, true));
  }
  if (options?.companyId !== undefined) {
    baseConditions.push(eq(jobs.companyId, options.companyId));
  }
  if (options?.sourceId !== undefined) {
    baseConditions.push(
      options.sourceId === null ? isNull(jobs.sourceId) : eq(jobs.sourceId, options.sourceId),
    );
  }
  if (options?.sourceType !== undefined)
    baseConditions.push(eq(jobs.sourceType, options.sourceType));
  if (options?.workplaceType !== undefined) {
    baseConditions.push(eq(jobs.workplaceType, options.workplaceType));
  }
  if (options?.location?.trim()) {
    baseConditions.push(like(jobs.location, `%${options.location.trim()}%`));
  }
  if (options?.lastSeenAfter !== undefined) {
    baseConditions.push(gte(jobs.lastSeenAt, options.lastSeenAfter));
  }
  const baseCondition = and(...baseConditions);

  // If searching, use FTS5
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("job", searchQuery);

    if (!matchingIds.length && !options?.searchCompanyNames) {
      return { items: [], total: 0 };
    }

    const searchCondition = options?.searchCompanyNames
      ? or(
          inArray(jobs.id, matchingIds),
          like(jobs.title, `%${searchQuery}%`),
          like(jobs.location, `%${searchQuery}%`),
          inArray(
            jobs.companyId,
            db
              .select({ id: companies.id })
              .from(companies)
              .where(like(companies.name, `%${searchQuery}%`)),
          ),
        )
      : inArray(jobs.id, matchingIds);

    const rows = await db
      .select({
        job: jobs,
        companyName: companies.name,
        companyLogo: companies.logo,
        importSourceType: jobImportSources.sourceType,
        importSourceIdentifier: jobImportSources.sourceIdentifier,
        importSourceUrl: jobImportSources.sourceUrl,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .leftJoin(jobImportSources, eq(jobs.sourceId, jobImportSources.id))
      .where(and(baseCondition, searchCondition))
      .orderBy(
        ordering ??
          (matchingIds.length ? searchRankOrder(jobs.id, matchingIds) : desc(jobs.createdAt)),
        desc(jobs.id),
      )
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(jobs)
      .where(and(baseCondition, searchCondition));

    return {
      items: rows.map(({ job, ...related }) => ({
        ...job,
        ...related,
      })),
      total,
    };
  }

  const [{ total }] = await db.select({ total: count() }).from(jobs).where(baseCondition);

  const rows = await db
    .select({
      job: jobs,
      companyName: companies.name,
      companyLogo: companies.logo,
      importSourceType: jobImportSources.sourceType,
      importSourceIdentifier: jobImportSources.sourceIdentifier,
      importSourceUrl: jobImportSources.sourceUrl,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .leftJoin(jobImportSources, eq(jobs.sourceId, jobImportSources.id))
    .where(baseCondition)
    .orderBy(ordering ?? desc(jobs.postedAt), desc(jobs.id))
    .limit(limit)
    .offset(offset);

  return {
    items: rows.map(({ job, ...related }) => ({
      ...job,
      ...related,
    })),
    total,
  };
}

// =============================================================================
// Jobs grouped by company
// =============================================================================

export interface CompanyWithJobs {
  company: {
    id: number;
    name: string;
    slug: string;
    logo: string | null;
    website: string | null;
    careersUrl: string | null;
    location: string | null;
  };
  jobs: Job[];
}

/**
 * Get active jobs grouped by company
 * Companies are shuffled deterministically each day for fair exposure; jobs within each company
 * remain sorted by most recent posting.
 */
export async function getJobsGroupedByCompany(options?: {
  includeNonTechnical?: boolean;
}): Promise<CompanyWithJobs[]> {
  const includeNonTechnical = options?.includeNonTechnical ?? false;

  // Build where conditions
  const conditions = [eq(jobs.status, "active")];
  if (!includeNonTechnical) {
    conditions.push(eq(jobs.isTechnical, true));
  }

  // Get all active jobs with company info
  const data = await db
    .select({
      job: jobs,
      company: {
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        logo: companies.logo,
        website: companies.website,
        careersUrl: companies.careersUrl,
        location: companies.location,
      },
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(jobs.postedAt));

  // Group jobs by company
  const companyMap = new Map<
    number | null,
    { company: CompanyWithJobs["company"] | null; jobs: Job[] }
  >();

  for (const { job, company } of data) {
    const key = job.companyId;
    if (!companyMap.has(key)) {
      companyMap.set(key, {
        company: company?.id ? company : null,
        jobs: [],
      });
    }
    companyMap.get(key)!.jobs.push(job);
  }

  // Convert to array and filter out jobs without companies
  const result: CompanyWithJobs[] = [];
  for (const [, value] of companyMap) {
    if (value.company) {
      result.push({
        company: value.company,
        jobs: value.jobs,
      });
    }
  }

  // Daily seeded shuffle for company ordering so no company is permanently favoured
  const dateSeed = parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ""), 10);
  result.sort((a, b) => {
    const hashA = ((a.company.id + dateSeed) * 2654435761) >>> 0;
    const hashB = ((b.company.id + dateSeed) * 2654435761) >>> 0;
    return hashA - hashB;
  });

  return result;
}

// =============================================================================
// Extended job data with company info
// =============================================================================

export interface JobWithCompany extends Job {
  company: {
    id: number;
    name: string;
    slug: string;
    logo: string | null;
  } | null;
}

/**
 * Get a job with its company info (for detail pages)
 */
export async function getJobWithCompany(id: number): Promise<JobWithCompany | null> {
  const job = await getJobById(id);
  if (!job) return null;

  let company: JobWithCompany["company"] = null;
  if (job.companyId) {
    const [c] = await db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        logo: companies.logo,
      })
      .from(companies)
      .where(eq(companies.id, job.companyId))
      .limit(1);
    company = c ?? null;
  }

  return { ...job, company };
}

/**
 * Get a job by slug with company info
 */
export async function getJobBySlugWithCompany(slug: string): Promise<JobWithCompany | null> {
  const job = await getJobBySlug(slug);
  if (!job) return null;

  let company: JobWithCompany["company"] = null;
  if (job.companyId) {
    const [c] = await db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        logo: companies.logo,
      })
      .from(companies)
      .where(eq(companies.id, job.companyId))
      .limit(1);
    company = c ?? null;
  }

  return { ...job, company };
}

export async function deactivateJob(id: number, reason: "removed" | "filled" | "expired") {
  const now = new Date();
  return (
    (
      await db
        .update(jobs)
        .set({ status: reason, removedAt: now, updatedAt: now })
        .where(eq(jobs.id, id))
        .returning()
    )[0] ?? null
  );
}
