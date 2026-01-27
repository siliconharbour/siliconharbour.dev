import { db } from "~/db";
import { jobs, type Job, type NewJob } from "~/db/schema";
import { eq, desc, gte, or, isNull, and, count, inArray } from "drizzle-orm";
import { generateSlug, makeSlugUnique } from "./slug";
import { syncReferences } from "./references.server";
import { searchContentIds } from "./search.server";

async function getExistingSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: jobs.slug }).from(jobs);
  return rows.map((r) => r.slug);
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
    if (current) {
      existingSlugs = existingSlugs.filter((s) => s !== current.slug);
    }
  }

  return makeSlugUnique(baseSlug, existingSlugs);
}

export async function createJob(job: Omit<NewJob, "slug">): Promise<Job> {
  const slug = await generateJobSlug(job.title);
  const [newJob] = await db
    .insert(jobs)
    .values({ ...job, slug })
    .returning();

  await syncReferences("job", newJob.id, newJob.description);

  return newJob;
}

export async function updateJob(
  id: number,
  job: Partial<Omit<NewJob, "slug">>,
): Promise<Job | null> {
  let updateData: Partial<NewJob> = { ...job, updatedAt: new Date() };

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

export async function getAllJobs(): Promise<Job[]> {
  return db.select().from(jobs).orderBy(desc(jobs.postedAt));
}

export async function getActiveJobs(): Promise<Job[]> {
  const now = new Date();
  return db
    .select()
    .from(jobs)
    .where(or(isNull(jobs.expiresAt), gte(jobs.expiresAt, now)))
    .orderBy(desc(jobs.postedAt));
}

// =============================================================================
// Paginated queries with search
// =============================================================================

export interface PaginatedJobs {
  items: Job[];
  total: number;
}

export async function getPaginatedJobs(
  limit: number,
  offset: number,
  searchQuery?: string,
): Promise<PaginatedJobs> {
  const now = new Date();
  const activeCondition = or(isNull(jobs.expiresAt), gte(jobs.expiresAt, now));

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
      .where(and(activeCondition, inArray(jobs.id, matchingIds)))
      .orderBy(desc(jobs.postedAt))
      .limit(limit)
      .offset(offset);

    // Count total matching active jobs
    const [{ total }] = await db
      .select({ total: count() })
      .from(jobs)
      .where(and(activeCondition, inArray(jobs.id, matchingIds)));

    return { items, total };
  }

  // No search - get total count and paginated items (active only)
  const [{ total }] = await db.select({ total: count() }).from(jobs).where(activeCondition);

  const items = await db
    .select()
    .from(jobs)
    .where(activeCondition)
    .orderBy(desc(jobs.postedAt))
    .limit(limit)
    .offset(offset);

  return { items, total };
}
