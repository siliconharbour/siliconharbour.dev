/**
 * Job Import Sync Logic
 * Handles the sync algorithm for importing jobs from external sources
 */

import { db } from "~/db";
import { jobImportSources, jobs } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import type { SyncResult, ImportSourceConfig, JobSourceType } from "./types";
import { getImporter } from "./index";

/**
 * Get an import source by ID with company info
 */
export async function getSourceById(sourceId: number) {
  const [source] = await db
    .select()
    .from(jobImportSources)
    .where(eq(jobImportSources.id, sourceId))
    .limit(1);
  
  return source;
}

/**
 * Get all jobs for a source
 */
async function getJobsBySourceId(sourceId: number) {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.sourceId, sourceId));
}

/**
 * Insert a new imported job
 */
async function insertJob(data: {
  companyId: number;
  sourceId: number;
  externalId: string;
  title: string;
  location?: string | null;
  department?: string | null;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  url?: string | null;
  workplaceType?: "remote" | "onsite" | "hybrid" | null;
  postedAt?: Date | null;
  updatedAt?: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}) {
  const now = new Date();
  await db.insert(jobs).values({
    companyId: data.companyId,
    sourceId: data.sourceId,
    sourceType: "imported",
    externalId: data.externalId,
    title: data.title,
    location: data.location,
    department: data.department,
    descriptionHtml: data.descriptionHtml,
    descriptionText: data.descriptionText,
    url: data.url,
    workplaceType: data.workplaceType,
    postedAt: data.postedAt,
    externalUpdatedAt: data.updatedAt,
    firstSeenAt: data.firstSeenAt,
    lastSeenAt: data.lastSeenAt,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Update an existing imported job
 */
async function updateJob(
  jobId: number,
  data: {
    title?: string;
    location?: string | null;
    department?: string | null;
    descriptionHtml?: string | null;
    descriptionText?: string | null;
    url?: string | null;
    workplaceType?: "remote" | "onsite" | "hybrid" | null;
    postedAt?: Date | null;
    updatedAt?: Date | null;
    lastSeenAt?: Date;
    removedAt?: Date | null;
    status?: "active" | "removed" | "filled" | "expired";
  },
) {
  await db
    .update(jobs)
    .set({
      ...data,
      externalUpdatedAt: data.updatedAt,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

/**
 * Update source metadata after a sync
 */
async function updateSource(
  sourceId: number,
  data: {
    lastFetchedAt?: Date;
    fetchStatus?: "pending" | "success" | "error";
    fetchError?: string | null;
  },
) {
  await db
    .update(jobImportSources)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(jobImportSources.id, sourceId));
}

/**
 * Sync jobs from an external source
 * 
 * Algorithm:
 * 1. Fetch current jobs from ATS
 * 2. Get our existing jobs for this source
 * 3. For each fetched job:
 *    - If new: insert with first_seen_at = now
 *    - If reactivated (was removed): clear removed_at, set status to active
 *    - If existing: update last_seen_at and any changed fields
 * 4. For existing jobs not in fetched list: mark as removed
 * 5. Update source metadata
 */
export async function syncJobs(sourceId: number): Promise<SyncResult> {
  const source = await getSourceById(sourceId);
  if (!source) {
    return {
      success: false,
      error: "Source not found",
      added: 0,
      updated: 0,
      removed: 0,
      reactivated: 0,
      totalActive: 0,
    };
  }

  // Mark as pending
  await updateSource(sourceId, { fetchStatus: "pending", fetchError: null });

  try {
    const importer = getImporter(source.sourceType as JobSourceType);
    
    const config: ImportSourceConfig = {
      id: source.id,
      companyId: source.companyId,
      sourceType: source.sourceType as JobSourceType,
      sourceIdentifier: source.sourceIdentifier,
      sourceUrl: source.sourceUrl,
    };

    // 1. Fetch current jobs from ATS
    const fetchedJobs = await importer.fetchJobs(config);
    const fetchedIds = new Set(fetchedJobs.map(j => j.externalId));

    // 2. Get our existing jobs for this source
    const existingJobs = await getJobsBySourceId(sourceId);
    const existingByExternalId = new Map(existingJobs.map(j => [j.externalId, j]));

    const now = new Date();
    const results = { added: 0, updated: 0, removed: 0, reactivated: 0 };

    // 3. Process fetched jobs
    for (const job of fetchedJobs) {
      const existing = existingByExternalId.get(job.externalId);

      if (!existing) {
        // NEW JOB: insert with first_seen_at = now
        await insertJob({
          companyId: source.companyId,
          sourceId: source.id,
          externalId: job.externalId,
          title: job.title,
          location: job.location,
          department: job.department,
          descriptionHtml: job.descriptionHtml,
          descriptionText: job.descriptionText,
          url: job.url,
          workplaceType: job.workplaceType,
          postedAt: job.postedAt,
          updatedAt: job.updatedAt,
          firstSeenAt: now,
          lastSeenAt: now,
        });
        results.added++;
      } else if (existing.status === "hidden") {
        // HIDDEN: user explicitly hid this job, just update lastSeenAt but don't reactivate
        await updateJob(existing.id, {
          lastSeenAt: now,
        });
        results.updated++;
      } else if (existing.status !== "active") {
        // REACTIVATED: job came back after being removed
        await updateJob(existing.id, {
          title: job.title,
          location: job.location,
          department: job.department,
          descriptionHtml: job.descriptionHtml,
          descriptionText: job.descriptionText,
          url: job.url,
          workplaceType: job.workplaceType,
          postedAt: job.postedAt,
          updatedAt: job.updatedAt,
          lastSeenAt: now,
          removedAt: null,
          status: "active",
        });
        results.reactivated++;
      } else {
        // EXISTING: update last_seen_at and any changed fields
        await updateJob(existing.id, {
          title: job.title,
          location: job.location,
          department: job.department,
          descriptionHtml: job.descriptionHtml,
          descriptionText: job.descriptionText,
          url: job.url,
          workplaceType: job.workplaceType,
          postedAt: job.postedAt,
          updatedAt: job.updatedAt,
          lastSeenAt: now,
        });
        results.updated++;
      }
    }

    // 4. Mark jobs no longer in feed as removed
    for (const existing of existingJobs) {
      if (existing.status === "active" && existing.externalId && !fetchedIds.has(existing.externalId)) {
        await updateJob(existing.id, { removedAt: now, status: "removed" });
        results.removed++;
      }
    }

    // 5. Update source metadata
    await updateSource(sourceId, { lastFetchedAt: now, fetchStatus: "success", fetchError: null });

    // Count total active jobs
    const totalActive = results.added + results.reactivated + (existingJobs.filter(j => j.status === "active").length - results.removed);

    return {
      success: true,
      ...results,
      totalActive,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await updateSource(sourceId, { fetchStatus: "error", fetchError: error });
    
    return {
      success: false,
      error,
      added: 0,
      updated: 0,
      removed: 0,
      reactivated: 0,
      totalActive: 0,
    };
  }
}

/**
 * Get active jobs for a company
 */
export async function getActiveJobsForCompany(companyId: number) {
  return db
    .select()
    .from(jobs)
    .where(and(
      eq(jobs.companyId, companyId),
      eq(jobs.status, "active"),
    ))
    .orderBy(jobs.firstSeenAt);
}

/**
 * Get all import sources with stats
 */
export async function getAllImportSources() {
  const sources = await db
    .select()
    .from(jobImportSources)
    .orderBy(jobImportSources.updatedAt);
  
  // Get job counts per source
  const jobCounts = await db
    .select({
      sourceId: jobs.sourceId,
    })
    .from(jobs)
    .where(eq(jobs.status, "active"));
  
  const countBySource = new Map<number, number>();
  for (const row of jobCounts) {
    if (row.sourceId) {
      countBySource.set(row.sourceId, (countBySource.get(row.sourceId) || 0) + 1);
    }
  }
  
  return sources.map(source => ({
    ...source,
    activeJobCount: countBySource.get(source.id) || 0,
  }));
}

/**
 * Get a single import source with stats
 */
export async function getImportSourceWithStats(sourceId: number) {
  const [source] = await db
    .select()
    .from(jobImportSources)
    .where(eq(jobImportSources.id, sourceId))
    .limit(1);
  
  if (!source) return null;
  
  const sourceJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.sourceId, sourceId));
  
  const activeCount = sourceJobs.filter(j => j.status === "active").length;
  const removedCount = sourceJobs.filter(j => j.status === "removed").length;
  
  return {
    ...source,
    activeJobCount: activeCount,
    removedJobCount: removedCount,
    totalJobCount: sourceJobs.length,
    jobs: sourceJobs,
  };
}

/**
 * Create a new import source
 */
export async function createImportSource(data: {
  companyId: number;
  sourceType: JobSourceType;
  sourceIdentifier: string;
  sourceUrl?: string | null;
}) {
  const now = new Date();
  const [result] = await db
    .insert(jobImportSources)
    .values({
      companyId: data.companyId,
      sourceType: data.sourceType,
      sourceIdentifier: data.sourceIdentifier,
      sourceUrl: data.sourceUrl,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: jobImportSources.id });
  
  return result.id;
}

/**
 * Delete an import source (cascades to jobs)
 */
export async function deleteImportSource(sourceId: number) {
  await db.delete(jobImportSources).where(eq(jobImportSources.id, sourceId));
}

/**
 * Hide an imported job (won't show on company pages, won't be reactivated)
 */
export async function hideImportedJob(jobId: number) {
  await db
    .update(jobs)
    .set({ status: "hidden", updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

/**
 * Unhide an imported job (restore to active)
 */
export async function unhideImportedJob(jobId: number) {
  await db
    .update(jobs)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

/**
 * Get an imported job by ID
 */
export async function getImportedJobById(jobId: number) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return job || null;
}
