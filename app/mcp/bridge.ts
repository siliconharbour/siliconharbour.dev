/**
 * Host bridge: real DB/sync functions exposed directly into the QuickJS sandbox.
 * Each function is called on-demand by user code — no pre-fetching.
 */

import { z } from "zod";
import type { HostFunctions } from "./sandbox.js";
import { getUpcomingEvents, getPaginatedEvents } from "~/lib/events.server";
import { getPaginatedJobs } from "~/lib/jobs.server";
import { getPaginatedCompanies } from "~/lib/companies.server";
import { getPaginatedGroups } from "~/lib/groups.server";
import { getPaginatedPeople } from "~/lib/people.server";
import { getAllTechnologies } from "~/lib/technologies.server";
import { getPaginatedEducation } from "~/lib/education.server";
import {
  getAllEventImportSources,
  syncEvents,
  createEventImportSource,
  validateEventImportSourceConfig,
} from "~/lib/event-importers/sync.server";
import {
  getAllImportSources,
  syncJobs,
  createImportSource as createJobImportSource,
  getImportedJobById,
  approveJob,
  approveJobAsNonTechnical,
  hideImportedJob,
} from "~/lib/job-importers/sync.server";
import { getImporter, getAllImporterMeta } from "~/lib/job-importers/index";
import type { JobSourceType } from "~/lib/job-importers/types";
import {
  createCompany as createCompanyRecord,
  getCompanyByName as getCompanyByNameRecord,
  updateCompany as updateCompanyRecord,
  getCompanyById as getCompanyByIdRecord,
} from "~/lib/companies.server";
import { createJob as createJobRecord } from "~/lib/jobs.server";
import { db } from "~/db";
import { events, jobs, companies } from "~/db/schema";
import { eq, and } from "drizzle-orm";

// ── Zod schemas ────────────────────────────────────────────────────────

const PaginationSchema = z.object({
  limit: z.number().optional(),
  offset: z.number().optional(),
  query: z.string().optional(),
  upcoming: z.boolean().optional(),
});

const CreateCompanySchema = z.object({
  name: z.string().min(1, "name is required"),
  website: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  email: z.string().optional(),
});

const UpdateCompanySchema = z.object({
  id: z.number({ required_error: "id is required" }),
  name: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  email: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
  wikipedia: z.string().optional(),
  careersUrl: z.string().optional(),
  founded: z.string().optional(),
  visible: z.boolean().optional(),
  technl: z.boolean().optional(),
  genesis: z.boolean().optional(),
  bounce: z.boolean().optional(),
});

const CreateJobSourceSchema = z.object({
  companyId: z.number({ required_error: "companyId is required" }),
  sourceType: z.string().min(1, "sourceType is required"),
  sourceIdentifier: z.string().min(1, "sourceIdentifier is required"),
  sourceUrl: z.string().optional(),
  skipValidation: z.boolean().optional(),
});

const CreateEventSourceSchema = z.object({
  name: z.string().min(1, "name is required"),
  sourceType: z.string().min(1, "sourceType is required"),
  sourceIdentifier: z.string().min(1, "sourceIdentifier is required"),
  sourceUrl: z.string().min(1, "sourceUrl is required"),
  organizer: z.string().optional(),
});

const ReviewJobSchema = z.object({
  jobId: z.number({ required_error: "jobId is required" }),
  action: z.enum(["approve", "approve-non-technical", "hide"], {
    required_error: "action is required (approve, approve-non-technical, hide)",
  }),
});

const CreateJobSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().min(1, "description is required"),
  url: z.string().min(1, "url is required (apply link)"),
  companyId: z.number().optional(),
  companyName: z.string().optional(),
  location: z.string().optional(),
  department: z.string().optional(),
  workplaceType: z.enum(["remote", "onsite", "hybrid"]).optional(),
  salaryRange: z.string().optional(),
  isTechnical: z.boolean().optional(),
});

const DeactivateJobSchema = z.object({
  jobId: z.number({ required_error: "jobId is required" }),
  reason: z.enum(["removed", "filled", "expired"], {
    required_error: "reason is required (removed, filled, expired)",
  }),
});

/** Strip non-serialisable values (Dates → ISO strings, etc.) */
function toPlain<T>(val: T): T {
  return JSON.parse(
    JSON.stringify(val, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    }),
  );
}

/** Read-only host functions — safe to expose without auth */
export function buildReadFunctions(): HostFunctions {
  return {
    async events(opts: unknown) {
      const o = PaginationSchema.parse(opts ?? {});
      const limit = o.limit ?? 20;
      const offset = o.offset ?? 0;
      if (o.upcoming) {
        const all = await getUpcomingEvents();
        return toPlain(all.slice(offset, offset + limit));
      }
      const result = await getPaginatedEvents(limit, offset);
      return toPlain((result as { events?: unknown[] }).events ?? result);
    },

    async jobs(opts: unknown) {
      const o = PaginationSchema.parse(opts ?? {});
      const result = await getPaginatedJobs(o.limit ?? 20, o.offset ?? 0, o.query, {
        includeNonTechnical: true,
      });
      return toPlain(result.items);
    },

    async companies(opts: unknown) {
      const o = PaginationSchema.parse(opts ?? {});
      const result = await getPaginatedCompanies(o.limit ?? 20, o.offset ?? 0, o.query);
      return toPlain(result.items);
    },

    async groups(opts: unknown) {
      const o = PaginationSchema.parse(opts ?? {});
      const result = await getPaginatedGroups(o.limit ?? 20, o.offset ?? 0);
      return toPlain(result.items);
    },

    async people(opts: unknown) {
      const o = PaginationSchema.parse(opts ?? {});
      const result = await getPaginatedPeople(o.limit ?? 20, o.offset ?? 0, o.query);
      return toPlain(result.items);
    },

    async technologies(opts: unknown) {
      const o = PaginationSchema.parse(opts ?? {});
      const all = await getAllTechnologies();
      const offset = o.offset ?? 0;
      return toPlain(all.slice(offset, offset + (o.limit ?? 20)));
    },

    async education(opts: unknown) {
      const o = PaginationSchema.parse(opts ?? {});
      const result = await getPaginatedEducation(o.limit ?? 20, o.offset ?? 0);
      return toPlain(result.items);
    },
  };
}

/** Execute host functions — superset of read, adds sync and pending actions */
export function buildExecuteFunctions(): HostFunctions {
  return {
    ...buildReadFunctions(),

    async eventImportSources() {
      const sources = await getAllEventImportSources();
      return toPlain(
        sources.map((s) => ({
          id: s.id,
          name: s.name,
          sourceType: s.sourceType,
          lastFetchedAt: s.lastFetchedAt,
          fetchStatus: s.fetchStatus,
          pendingCount: s.pendingCount,
        })),
      );
    },

    async jobImportSources() {
      const sources = await getAllImportSources();
      return toPlain(
        sources.map((s) => ({
          id: s.id,
          name: s.sourceIdentifier,
          sourceType: s.sourceType,
          lastFetchedAt: s.lastFetchedAt,
          fetchStatus: s.fetchStatus,
        })),
      );
    },

    async pendingEvents() {
      const sources = await getAllEventImportSources();
      const pending: unknown[] = [];
      for (const source of sources) {
        const evts = await db
          .select({ id: events.id, title: events.title, firstSeenAt: events.firstSeenAt })
          .from(events)
          .where(
            and(eq(events.importSourceId, source.id), eq(events.importStatus, "pending_review")),
          )
          .limit(50);
        for (const e of evts) {
          pending.push({
            sourceId: source.id,
            sourceName: source.name,
            eventId: e.id,
            title: e.title,
            firstSeenAt: e.firstSeenAt,
          });
        }
      }
      return toPlain(pending);
    },

    async pendingJobs() {
      const sources = await getAllImportSources();
      const pending: unknown[] = [];
      for (const source of sources) {
        const jobRows = await db
          .select()
          .from(jobs)
          .where(and(eq(jobs.sourceId, source.id), eq(jobs.status, "pending_review")))
          .limit(50);
        for (const j of jobRows) {
          const [company] = j.companyId
            ? await db
                .select({ name: companies.name })
                .from(companies)
                .where(eq(companies.id, j.companyId))
                .limit(1)
            : [];
          pending.push({
            jobId: j.id,
            title: j.title,
            companyName: company?.name ?? null,
            location: j.location,
            workplaceType: j.workplaceType,
            url: j.url,
            descriptionSnippet: j.descriptionText
              ? j.descriptionText.slice(0, 500) + (j.descriptionText.length > 500 ? "..." : "")
              : null,
            sourceType: source.sourceType,
          });
        }
      }
      return toPlain(pending);
    },

    async getJobDetail(jobId: unknown) {
      const job = await getImportedJobById(Number(jobId));
      if (!job) return { found: false, message: `Job ${jobId} not found` };
      const [company] = job.companyId
        ? await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, job.companyId))
            .limit(1)
        : [];
      return toPlain({
        found: true,
        job: {
          id: job.id,
          title: job.title,
          companyName: company?.name ?? null,
          location: job.location,
          workplaceType: job.workplaceType,
          department: job.department,
          status: job.status,
          isTechnical: job.isTechnical,
          url: job.url,
          descriptionText: job.descriptionText,
          postedAt: job.postedAt,
        },
      });
    },

    async reviewJob(opts: unknown) {
      const o = ReviewJobSchema.parse(opts ?? {});

      const job = await getImportedJobById(o.jobId);
      if (!job) throw new Error(`Job ${o.jobId} not found`);

      switch (o.action) {
        case "approve":
          await approveJob(o.jobId);
          return { jobId: o.jobId, action: "approve", message: `"${job.title}" approved as technical` };
        case "approve-non-technical":
          await approveJobAsNonTechnical(o.jobId);
          return { jobId: o.jobId, action: "approve-non-technical", message: `"${job.title}" approved as non-technical` };
        case "hide":
          await hideImportedJob(o.jobId);
          return { jobId: o.jobId, action: "hide", message: `"${job.title}" hidden` };
      }
    },

    async syncEventSource(sourceId: unknown) {
      return toPlain(await syncEvents(Number(sourceId)));
    },

    async syncAllEventSources() {
      const sources = await getAllEventImportSources();
      const results = [];
      for (const source of sources) {
        const result = await syncEvents(source.id);
        results.push({ sourceId: source.id, name: source.name, ...result });
      }
      return toPlain(results);
    },

    async syncJobSource(sourceId: unknown) {
      return toPlain(await syncJobs(Number(sourceId)));
    },

    async syncAllJobSources() {
      const sources = await getAllImportSources();
      const results = [];
      for (const source of sources) {
        const result = await syncJobs(source.id);
        results.push({ sourceId: source.id, name: source.sourceIdentifier, ...result });
      }
      return toPlain(results);
    },

    // ── Entity creation ──────────────────────────────────────────────

    async createCompany(opts: unknown) {
      const o = CreateCompanySchema.parse(opts ?? {});
      const existing = await getCompanyByNameRecord(o.name.trim());
      if (existing) {
        return toPlain({
          created: false,
          message: `Company "${existing.name}" already exists (id: ${existing.id})`,
          company: { id: existing.id, name: existing.name, slug: existing.slug },
        });
      }
      const company = await createCompanyRecord({
        name: o.name.trim(),
        description: o.description?.trim() || "",
        website: o.website?.trim() || null,
        location: o.location?.trim() || null,
        email: o.email?.trim() || null,
        logo: null,
        visible: false,
      });
      return toPlain({
        created: true,
        message: `Company "${company.name}" created (hidden, pending review)`,
        company: { id: company.id, name: company.name, slug: company.slug },
      });
    },

    async getCompanyByName(name: unknown) {
      if (!name || typeof name !== "string") throw new Error("name is required (string)");
      const company = await getCompanyByNameRecord(name.trim());
      if (!company) return { found: false, message: `No company found matching "${name}"` };
      return toPlain({
        found: true,
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          website: company.website,
          visible: company.visible,
        },
      });
    },

    async updateCompany(opts: unknown) {
      const { id, ...fields } = UpdateCompanySchema.parse(opts ?? {});
      const existing = await getCompanyByIdRecord(id);
      if (!existing) throw new Error(`Company with id ${id} not found`);

      // Trim strings, convert empty to null (except description which stays "")
      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        if (typeof value === "string") {
          updates[key] = value.trim() || null;
        } else {
          updates[key] = value;
        }
      }
      if ("description" in updates && updates.description === null) {
        updates.description = "";
      }

      if (Object.keys(updates).length === 0) {
        return { updated: false, message: "No fields to update" };
      }

      await updateCompanyRecord(id, updates);
      return toPlain({
        updated: true,
        message: `Company "${existing.name}" updated (${Object.keys(updates).join(", ")})`,
      });
    },

    async createJobSource(opts: unknown) {
      const o = CreateJobSourceSchema.parse(opts ?? {});

      // Validate the source type is supported
      try {
        getImporter(o.sourceType as JobSourceType);
      } catch {
        throw new Error(
          `Unsupported sourceType "${o.sourceType}". Use listImporterTypes() to see available types.`,
        );
      }

      let jobCount: number | undefined;

      if (!o.skipValidation) {
        // Validate the config actually works
        const importer = getImporter(o.sourceType as JobSourceType);
        const validation = await importer.validateConfig({
          companyId: o.companyId,
          sourceType: o.sourceType as JobSourceType,
          sourceIdentifier: o.sourceIdentifier.trim(),
          sourceUrl: o.sourceUrl?.trim() || null,
        });
        if (!validation.valid) {
          return {
            created: false,
            message: `Validation failed: ${validation.error}. Use skipValidation: true to create anyway.`,
          };
        }
        jobCount = validation.jobCount;
      }

      const sourceId = await createJobImportSource({
        companyId: o.companyId,
        sourceType: o.sourceType as JobSourceType,
        sourceIdentifier: o.sourceIdentifier.trim(),
        sourceUrl: o.sourceUrl?.trim() || null,
      });
      return {
        created: true,
        sourceId,
        message: `Job import source created (id: ${sourceId})${o.skipValidation ? " (validation skipped)" : ""}. Use syncJobSource(${sourceId}) to run first sync.`,
        jobCount,
      };
    },

    async createEventSource(opts: unknown) {
      const o = CreateEventSourceSchema.parse(opts ?? {});

      // Validate the config actually works
      const validation = await validateEventImportSourceConfig({
        organizer: o.organizer?.trim() || null,
        sourceType: o.sourceType,
        sourceIdentifier: o.sourceIdentifier.trim(),
        sourceUrl: o.sourceUrl.trim(),
      });
      if (!validation.valid) {
        return {
          created: false,
          message: `Validation failed: ${validation.error}`,
        };
      }

      const source = await createEventImportSource({
        name: o.name.trim(),
        organizer: o.organizer?.trim() || null,
        sourceType: o.sourceType,
        sourceIdentifier: o.sourceIdentifier.trim(),
        sourceUrl: o.sourceUrl.trim(),
      });
      return {
        created: true,
        sourceId: source.id,
        message: `Event import source "${o.name}" created (id: ${source.id}). Use syncEventSource(${source.id}) to run first sync.`,
        eventCount: validation.eventCount,
      };
    },

    async listImporterTypes() {
      return getAllImporterMeta();
    },

    async createJob(opts: unknown) {
      const o = CreateJobSchema.parse(opts ?? {});

      // Resolve company by name if companyName provided instead of companyId
      let companyId = o.companyId ?? null;
      if (!companyId && o.companyName) {
        const company = await getCompanyByNameRecord(o.companyName);
        if (company) {
          companyId = company.id;
        } else {
          return {
            created: false,
            message: `Company "${o.companyName}" not found. Use getCompanyByName() to check, or createCompany() first.`,
          };
        }
      }

      const job = await createJobRecord({
        title: o.title.trim(),
        description: o.description.trim(),
        url: o.url.trim(),
        companyId,
        location: o.location?.trim() || null,
        department: o.department?.trim() || null,
        workplaceType: o.workplaceType || null,
        salaryRange: o.salaryRange?.trim() || null,
      });

      // If isTechnical is explicitly set to false, mark as non-technical
      if (o.isTechnical === false) {
        await db
          .update(jobs)
          .set({ isTechnical: false })
          .where(eq(jobs.id, job.id));
      }

      return toPlain({
        created: true,
        jobId: job.id,
        slug: job.slug,
        message: `Job "${o.title}" created (active, manual). View at /manage/jobs/${job.id}`,
      });
    },

    async getManualJobs() {
      const manualJobs = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.sourceType, "manual"), eq(jobs.status, "active")));

      const results = [];
      for (const j of manualJobs) {
        const [company] = j.companyId
          ? await db
              .select({ name: companies.name })
              .from(companies)
              .where(eq(companies.id, j.companyId))
              .limit(1)
          : [];
        results.push({
          jobId: j.id,
          title: j.title,
          companyName: company?.name ?? null,
          location: j.location,
          workplaceType: j.workplaceType,
          url: j.url,
          createdAt: j.createdAt,
        });
      }
      return toPlain(results);
    },

    async deactivateJob(opts: unknown) {
      const o = DeactivateJobSchema.parse(opts ?? {});
      const job = await getImportedJobById(o.jobId);
      if (!job) throw new Error(`Job ${o.jobId} not found`);

      const now = new Date();
      await db
        .update(jobs)
        .set({ status: o.reason, removedAt: now, updatedAt: now })
        .where(eq(jobs.id, o.jobId));

      return {
        jobId: o.jobId,
        reason: o.reason,
        message: `"${job.title}" marked as ${o.reason}`,
      };
    },
  };
}
