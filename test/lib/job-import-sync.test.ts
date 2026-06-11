import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { jobs, jobImportSources, companies } from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  approveJob,
  hideImportedJob,
  unhideImportedJob,
  requeueImportedJob,
  markJobNonTechnical,
  markJobTechnical,
  deleteImportSource,
  createImportSource,
  syncJobsFromFetched,
} from "~/lib/job-importers/sync.server";
import type { FetchedJob } from "~/lib/job-importers/types";

// =============================================================================
// Helpers
// =============================================================================

/** Create a company (required FK for job_import_sources) */
async function seedCompany() {
  const slug = `company-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const [company] = await db
    .insert(companies)
    .values({
      slug,
      name: "Test Company",
      description: "A test company",
    })
    .returning();
  return company;
}

/** Create a job import source linked to a company */
async function seedSource(companyId: number) {
  const sourceId = await createImportSource({
    companyId,
    sourceType: "greenhouse",
    sourceIdentifier: "test-board",
    sourceUrl: "https://example.com/jobs",
  });
  return sourceId;
}

/** Insert a job directly for setup purposes */
async function seedJob(
  companyId: number,
  sourceId: number,
  status: string,
  externalId: string,
  overrides?: Record<string, unknown>,
) {
  const now = new Date();
  const slug = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const [job] = await db
    .insert(jobs)
    .values({
      companyId,
      sourceId,
      sourceType: "imported",
      externalId,
      slug,
      title: "Test Job",
      status: status as "active" | "pending_review" | "removed" | "filled" | "expired" | "hidden",
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning();
  return job;
}

function makeFetchedJob(externalId: string, overrides?: Partial<FetchedJob>): FetchedJob {
  return {
    externalId,
    title: `Job ${externalId}`,
    url: `https://example.com/jobs/${externalId}`,
    ...overrides,
  };
}

// =============================================================================
// Status transitions
// =============================================================================

describe("approveJob", () => {
  it("sets status to active", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    const job = await seedJob(company.id, sourceId, "pending_review", "ext-1");

    await approveJob(job.id);

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(updated.status).toBe("active");
  });
});

describe("hideImportedJob", () => {
  it("sets status to hidden", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    const job = await seedJob(company.id, sourceId, "active", "ext-1");

    await hideImportedJob(job.id);

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(updated.status).toBe("hidden");
  });
});

describe("unhideImportedJob", () => {
  it("sets status to active", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    const job = await seedJob(company.id, sourceId, "hidden", "ext-1");

    await unhideImportedJob(job.id);

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(updated.status).toBe("active");
  });
});

describe("requeueImportedJob", () => {
  it("sets status back to pending_review and clears removedAt", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    const job = await seedJob(company.id, sourceId, "hidden", "ext-1", {
      removedAt: new Date("2026-01-01T00:00:00Z"),
    });

    await requeueImportedJob(job.id);

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(updated.status).toBe("pending_review");
    expect(updated.removedAt).toBeNull();
  });
});

describe("markJobNonTechnical", () => {
  it("sets isTechnical to false", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    const job = await seedJob(company.id, sourceId, "active", "ext-1");

    await markJobNonTechnical(job.id);

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(updated.isTechnical).toBe(false);
  });
});

describe("markJobTechnical", () => {
  it("sets isTechnical to true", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    const job = await seedJob(company.id, sourceId, "active", "ext-1", {
      isTechnical: false,
    });

    await markJobTechnical(job.id);

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(updated.isTechnical).toBe(true);
  });
});

// =============================================================================
// deleteImportSource
// =============================================================================

describe("deleteImportSource", () => {
  it("deletes the source record", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);

    await deleteImportSource(sourceId);

    const rows = await db.select().from(jobImportSources).where(eq(jobImportSources.id, sourceId));
    expect(rows).toHaveLength(0);
  });

  it("cascade-deletes jobs linked to the source", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    const job = await seedJob(company.id, sourceId, "pending_review", "ext-1");

    await deleteImportSource(sourceId);

    const rows = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(rows).toHaveLength(0);
  });
});

// =============================================================================
// syncJobsFromFetched — state machine
// =============================================================================

describe("syncJobsFromFetched", () => {
  it("inserts new jobs as pending_review", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);

    const fetched = [makeFetchedJob("new-1"), makeFetchedJob("new-2")];
    const result = await syncJobsFromFetched(sourceId, fetched);

    expect(result.success).toBe(true);
    expect(result.added).toBe(2);

    const allJobs = await db.select().from(jobs).where(eq(jobs.sourceId, sourceId));
    expect(allJobs).toHaveLength(2);
    expect(allJobs.every((j) => j.status === "pending_review")).toBe(true);
  });

  it("updates existing active job fields", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    await seedJob(company.id, sourceId, "active", "ext-1", {
      title: "Old Title",
    });

    const fetched = [makeFetchedJob("ext-1", { title: "New Title" })];
    const result = await syncJobsFromFetched(sourceId, fetched);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(1);

    const allJobs = await db.select().from(jobs).where(eq(jobs.sourceId, sourceId));
    expect(allJobs[0].title).toBe("New Title");
    expect(allJobs[0].status).toBe("active");
  });

  it("marks active jobs as removed when not in fetched list", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    const job = await seedJob(company.id, sourceId, "active", "ext-1");

    // Sync with empty list — the existing active job should be marked removed
    const result = await syncJobsFromFetched(sourceId, []);

    expect(result.success).toBe(true);
    expect(result.removed).toBe(1);

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(updated.status).toBe("removed");
    expect(updated.removedAt).not.toBeNull();
  });

  it("reactivates a previously removed job when it reappears", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    const job = await seedJob(company.id, sourceId, "removed", "ext-1", {
      removedAt: new Date(),
    });

    const fetched = [makeFetchedJob("ext-1", { title: "Back Again" })];
    const result = await syncJobsFromFetched(sourceId, fetched);

    expect(result.success).toBe(true);
    expect(result.reactivated).toBe(1);

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(updated.status).toBe("active");
    expect(updated.removedAt).toBeNull();
    expect(updated.title).toBe("Back Again");
  });

  it("refreshes fields on pending_review jobs without changing status", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    await seedJob(company.id, sourceId, "pending_review", "ext-1", {
      title: "Old Pending Title",
    });

    const fetched = [makeFetchedJob("ext-1", { title: "Updated Pending Title" })];
    const result = await syncJobsFromFetched(sourceId, fetched);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(1);

    const allJobs = await db.select().from(jobs).where(eq(jobs.sourceId, sourceId));
    expect(allJobs[0].title).toBe("Updated Pending Title");
    expect(allJobs[0].status).toBe("pending_review");
  });

  it("refreshes fields on hidden jobs without changing status", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    await seedJob(company.id, sourceId, "hidden", "ext-1", {
      title: "Old Hidden Title",
    });

    const fetched = [makeFetchedJob("ext-1", { title: "Updated Hidden Title" })];
    const result = await syncJobsFromFetched(sourceId, fetched);

    expect(result.success).toBe(true);
    expect(result.updated).toBe(1);

    const allJobs = await db.select().from(jobs).where(eq(jobs.sourceId, sourceId));
    expect(allJobs[0].title).toBe("Updated Hidden Title");
    expect(allJobs[0].status).toBe("hidden");
  });

  it("does not mark pending_review jobs as removed when absent from fetched", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);
    const job = await seedJob(company.id, sourceId, "pending_review", "ext-1");

    // Sync with empty list — pending jobs should NOT be marked removed
    const result = await syncJobsFromFetched(sourceId, []);

    expect(result.removed).toBe(0);

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(updated.status).toBe("pending_review");
  });

  it("returns error for non-existent source", async () => {
    const result = await syncJobsFromFetched(99999, []);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Source not found");
  });

  it("handles a complex mixed scenario", async () => {
    const company = await seedCompany();
    const sourceId = await seedSource(company.id);

    // Pre-seed existing jobs in various states
    await seedJob(company.id, sourceId, "active", "stays-active");
    await seedJob(company.id, sourceId, "active", "will-be-removed");
    await seedJob(company.id, sourceId, "removed", "will-reactivate", {
      removedAt: new Date(),
    });
    await seedJob(company.id, sourceId, "pending_review", "pending-refreshed");

    const fetched = [
      makeFetchedJob("stays-active", { title: "Still Here" }),
      makeFetchedJob("will-reactivate", { title: "Im Back" }),
      makeFetchedJob("pending-refreshed", { title: "Refreshed" }),
      makeFetchedJob("brand-new"),
    ];

    const result = await syncJobsFromFetched(sourceId, fetched);

    expect(result.success).toBe(true);
    expect(result.added).toBe(1); // brand-new
    expect(result.reactivated).toBe(1); // will-reactivate
    expect(result.removed).toBe(1); // will-be-removed
    // updated: stays-active (active, updated) + pending-refreshed (pending, refreshed)
    expect(result.updated).toBe(2);
  });
});
