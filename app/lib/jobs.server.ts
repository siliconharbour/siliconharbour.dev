import { db } from "~/db";
import { jobs, companies, type Job, type NewJob } from "~/db/schema";
import { eq, desc, and, count, inArray, isNotNull } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: jobs.slug })
    .from(jobs)
    .where(isNotNull(jobs.slug));
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
  return db
    .select()
    .from(jobs)
    .orderBy(desc(jobs.postedAt));
}

/**
 * Get all active jobs for public display with company names
 * @param includeTechnical - if true, include only technical jobs (default: true for backward compat)
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
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(jobs.postedAt));

  return data.map(({ job, companyName }) => ({
    ...job,
    companyName,
  }));
}

// =============================================================================
// Paginated queries with search
// =============================================================================

export interface PaginatedJobs {
  items: Job[];
  total: number;
}

/**
 * Get paginated active jobs with optional search
 * @param includeNonTechnical - if true, include non-technical jobs (default: false)
 */
export async function getPaginatedJobs(
  limit: number,
  offset: number,
  searchQuery?: string,
  options?: { includeNonTechnical?: boolean },
): Promise<PaginatedJobs> {
  const includeNonTechnical = options?.includeNonTechnical ?? false;
  
  // Build base conditions
  const baseConditions = [eq(jobs.status, "active")];
  if (!includeNonTechnical) {
    baseConditions.push(eq(jobs.isTechnical, true));
  }
  const baseCondition = and(...baseConditions);

  // If searching, use FTS5
  if (searchQuery && searchQuery.trim()) {
    const matchingIds = searchContentIds("job", searchQuery);

    if (matchingIds.length === 0) {
      return { items: [], total: 0 };
    }

    // Filter to only active jobs that match search
    const items = await db
      .select()
      .from(jobs)
      .where(and(baseCondition, inArray(jobs.id, matchingIds)))
      .orderBy(desc(jobs.postedAt))
      .limit(limit)
      .offset(offset);

    // Count total matching active jobs
    const [{ total }] = await db
      .select({ total: count() })
      .from(jobs)
      .where(and(baseCondition, inArray(jobs.id, matchingIds)));

    return { items, total };
  }

  // No search - get total count and paginated items (active only)
  const [{ total }] = await db.select({ total: count() }).from(jobs).where(baseCondition);

  const items = await db
    .select()
    .from(jobs)
    .where(baseCondition)
    .orderBy(desc(jobs.postedAt))
    .limit(limit)
    .offset(offset);

  return { items, total };
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
 * Returns companies sorted by most recent job posting, with jobs within each company
 */
export async function getJobsGroupedByCompany(options?: { includeNonTechnical?: boolean }): Promise<CompanyWithJobs[]> {
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
  const companyMap = new Map<number | null, { company: CompanyWithJobs["company"] | null; jobs: Job[] }>();
  
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
  
  // Convert to array and filter out jobs without companies, then sort by most recent job
  const result: CompanyWithJobs[] = [];
  for (const [, value] of companyMap) {
    if (value.company) {
      result.push({
        company: value.company,
        jobs: value.jobs,
      });
    }
  }
  
  // Already sorted by most recent job due to the query order
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
