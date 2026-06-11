/**
 * Core CRUD + lookup coverage for app/lib/jobs.server.ts.
 *
 * Baseline (s-fa1b): 5.8% lines, ~19% functions covered.
 * Targets the load-bearing path used by the manage UI, the MCP
 * createEntity({ type:'job' }) dispatch, and the public jobs listing.
 */

import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { jobs } from "~/db/schema";
import { eq } from "drizzle-orm";
import {
  createJob,
  updateJob,
  deleteJob,
  getJobById,
  getJobBySlug,
  getAllJobs,
  getActiveJobs,
  getPaginatedJobs,
  getJobBySlugWithCompany,
  generateJobSlug,
} from "~/lib/jobs.server";
import { createCompany } from "~/lib/companies.server";

// =============================================================================
// Helpers
// =============================================================================

function jobInput(overrides: Partial<Parameters<typeof createJob>[0]> = {}) {
  return {
    title: "Senior Engineer",
    description: "Build cool things.",
    url: "https://example.com/apply",
    ...overrides,
  };
}

async function seedCompany(name = "Acme Co") {
  return createCompany({
    name,
    description: "Test company",
    website: null,
    location: null,
    email: null,
    logo: null,
    visible: true,
  });
}

// =============================================================================
// generateJobSlug — uniqueness handling
// =============================================================================

describe("generateJobSlug", () => {
  it("returns the slugified title when no collision exists", async () => {
    const slug = await generateJobSlug("Lead Platform Engineer");
    expect(slug).toBe("lead-platform-engineer");
  });

  it("appends -2 when the same title already exists", async () => {
    await createJob(jobInput({ title: "Backend Engineer" }));
    const slug = await generateJobSlug("Backend Engineer");
    expect(slug).toBe("backend-engineer-2");
  });

  it("walks through -2, -3 when multiple collisions exist", async () => {
    await createJob(jobInput({ title: "Frontend Dev" }));
    await createJob(jobInput({ title: "Frontend Dev" }));
    const slug = await generateJobSlug("Frontend Dev");
    expect(slug).toBe("frontend-dev-3");
  });

  it("does not consider the excludeId's own slug as a collision", async () => {
    const created = await createJob(jobInput({ title: "Tech Lead" }));
    const slug = await generateJobSlug("Tech Lead", created.id);
    expect(slug).toBe("tech-lead");
  });
});

// =============================================================================
// createJob
// =============================================================================

describe("createJob", () => {
  it("persists with generated slug, sourceType='manual', and status='active'", async () => {
    const created = await createJob(jobInput({ title: "Founding Engineer" }));
    expect(created.id).toBeGreaterThan(0);
    expect(created.slug).toBe("founding-engineer");
    expect(created.sourceType).toBe("manual");
    expect(created.status).toBe("active");
  });

  it("respects optional fields", async () => {
    const created = await createJob(
      jobInput({
        title: "Remote SRE",
        location: "Remote — Canada",
        department: "Infrastructure",
        workplaceType: "remote",
        salaryRange: "$120k–$160k",
      }),
    );
    expect(created.location).toBe("Remote — Canada");
    expect(created.department).toBe("Infrastructure");
    expect(created.workplaceType).toBe("remote");
    expect(created.salaryRange).toBe("$120k–$160k");
  });

  it("links the job to a company when companyId is supplied", async () => {
    const company = await seedCompany("HostCo");
    const created = await createJob(jobInput({ companyId: company.id }));
    expect(created.companyId).toBe(company.id);
  });

  it("stamps postedAt, firstSeenAt, and lastSeenAt at creation", async () => {
    // sqlite stores timestamps at second resolution, so round our bookend
    // measurements down to the second to make the comparisons meaningful.
    const before = Math.floor(Date.now() / 1000) * 1000;
    const created = await createJob(jobInput());
    const after = Date.now();
    expect(created.postedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(created.postedAt!.getTime()).toBeLessThanOrEqual(after);
    expect(created.firstSeenAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(created.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(before);
  });
});

// =============================================================================
// updateJob
// =============================================================================

describe("updateJob", () => {
  it("patches a single field", async () => {
    const created = await createJob(jobInput());
    const updated = await updateJob(created.id, { location: "St. John's, NL" });
    expect(updated).not.toBeNull();
    expect(updated!.location).toBe("St. John's, NL");
  });

  it("regenerates the slug when the title changes", async () => {
    const created = await createJob(jobInput({ title: "Old Name" }));
    const updated = await updateJob(created.id, { title: "Shiny New Name" });
    expect(updated!.slug).toBe("shiny-new-name");
  });

  it("returns null when the target id does not exist", async () => {
    const updated = await updateJob(999_999, { location: "noop" });
    expect(updated).toBeNull();
  });

  it("can change job status (used for soft delete)", async () => {
    const created = await createJob(jobInput());
    const updated = await updateJob(created.id, { status: "filled" });
    expect(updated!.status).toBe("filled");
  });

  it("can clear optional fields by passing null", async () => {
    const created = await createJob(jobInput({ department: "Engineering" }));
    const updated = await updateJob(created.id, { department: null });
    expect(updated!.department).toBeNull();
  });
});

// =============================================================================
// deleteJob
// =============================================================================

describe("deleteJob", () => {
  it("removes the row", async () => {
    const created = await createJob(jobInput());
    expect(await deleteJob(created.id)).toBe(true);
    expect(await getJobById(created.id)).toBeNull();
  });

  it("returns true even for a missing id (sqlite no-op semantics)", async () => {
    // deleteJob currently always returns true. Pin that behaviour so a
    // future refactor flagging missing rows doesn't surprise callers.
    expect(await deleteJob(999_999)).toBe(true);
  });
});

// =============================================================================
// Lookups
// =============================================================================

describe("getJobById / getJobBySlug", () => {
  it("getJobById returns the job", async () => {
    const created = await createJob(jobInput({ title: "Lookup By Id" }));
    const fetched = await getJobById(created.id);
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.title).toBe("Lookup By Id");
  });

  it("getJobBySlug round-trips with createJob's generated slug", async () => {
    const created = await createJob(jobInput({ title: "Slug Round Trip" }));
    const fetched = await getJobBySlug(created.slug!);
    expect(fetched!.id).toBe(created.id);
  });

  it("returns null for unknown id / slug", async () => {
    expect(await getJobById(999_999)).toBeNull();
    expect(await getJobBySlug("no-such-slug")).toBeNull();
  });
});

describe("getJobBySlugWithCompany", () => {
  it("attaches the company info when companyId is set", async () => {
    const company = await seedCompany("LookupCo");
    const created = await createJob(jobInput({ companyId: company.id }));

    const fetched = await getJobBySlugWithCompany(created.slug!);
    expect(fetched).not.toBeNull();
    expect(fetched!.company).not.toBeNull();
    expect(fetched!.company!.id).toBe(company.id);
    expect(fetched!.company!.name).toBe("LookupCo");
  });

  it("returns company:null when the job has no companyId", async () => {
    const created = await createJob(jobInput({ title: "Companyless Job" }));
    const fetched = await getJobBySlugWithCompany(created.slug!);
    expect(fetched).not.toBeNull();
    expect(fetched!.company).toBeNull();
  });

  it("returns null when the slug is not found", async () => {
    expect(await getJobBySlugWithCompany("no-such-slug")).toBeNull();
  });
});

// =============================================================================
// Filtered lists
// =============================================================================

describe("getAllJobs", () => {
  it("returns all jobs regardless of status", async () => {
    const active = await createJob(jobInput({ title: "Active Job" }));
    const filled = await createJob(jobInput({ title: "Filled Job" }));
    await updateJob(filled.id, { status: "filled" });

    const all = await getAllJobs();
    const ids = all.map((j) => j.id);
    expect(ids).toContain(active.id);
    expect(ids).toContain(filled.id);
  });
});

describe("getActiveJobs", () => {
  it("excludes non-active jobs by default", async () => {
    const active = await createJob(jobInput({ title: "Active" }));
    const filled = await createJob(jobInput({ title: "Filled" }));
    await updateJob(filled.id, { status: "filled" });

    const result = await getActiveJobs();
    const ids = result.map((j) => j.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(filled.id);
  });

  it("excludes non-technical jobs by default", async () => {
    const tech = await createJob(jobInput({ title: "Tech Role" }));
    // Manual jobs default to isTechnical=true (per the schema default).
    // Flip one to non-technical to test the filter.
    const nonTech = await createJob(jobInput({ title: "Non-tech Role" }));
    await db.update(jobs).set({ isTechnical: false }).where(eq(jobs.id, nonTech.id));

    const defaultResult = await getActiveJobs();
    const defaultIds = defaultResult.map((j) => j.id);
    expect(defaultIds).toContain(tech.id);
    expect(defaultIds).not.toContain(nonTech.id);
  });

  it("includes non-technical jobs when includeNonTechnical is true", async () => {
    const nonTech = await createJob(jobInput({ title: "Non-tech" }));
    await db.update(jobs).set({ isTechnical: false }).where(eq(jobs.id, nonTech.id));

    const result = await getActiveJobs({ includeNonTechnical: true });
    expect(result.some((j) => j.id === nonTech.id)).toBe(true);
  });

  it("attaches companyName when the job has a company", async () => {
    const company = await seedCompany("ActiveCo");
    await createJob(jobInput({ title: "With Company", companyId: company.id }));

    const result = await getActiveJobs();
    const job = result.find((j) => j.title === "With Company");
    expect(job!.companyName).toBe("ActiveCo");
  });
});

// =============================================================================
// Pagination
// =============================================================================

describe("getPaginatedJobs", () => {
  it("returns { items, total } and respects limit/offset", async () => {
    for (let i = 0; i < 5; i++) {
      await createJob(jobInput({ title: `Page Job ${i}` }));
    }

    const firstPage = await getPaginatedJobs(2, 0);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBe(5);

    const secondPage = await getPaginatedJobs(2, 2);
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.total).toBe(5);

    // Pages should not overlap.
    const firstIds = new Set(firstPage.items.map((j) => j.id));
    expect(secondPage.items.some((j) => firstIds.has(j.id))).toBe(false);
  });

  it("returns empty when there are no matching jobs", async () => {
    const empty = await getPaginatedJobs(10, 0);
    expect(empty.items).toHaveLength(0);
    expect(empty.total).toBe(0);
  });

  it("only counts active jobs in total", async () => {
    const active = await createJob(jobInput({ title: "Active" }));
    const filled = await createJob(jobInput({ title: "Filled" }));
    await updateJob(filled.id, { status: "filled" });

    const result = await getPaginatedJobs(10, 0);
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(active.id);
  });
});
