/**
 * Host bridge: real DB/sync functions exposed directly into the QuickJS sandbox.
 * Each function is called on-demand by user code — no pre-fetching.
 */

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
import { db } from "~/db";
import { events, jobs, companies } from "~/db/schema";
import { eq, and } from "drizzle-orm";

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
      const o = (opts ?? {}) as { limit?: number; offset?: number; upcoming?: boolean };
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
      const o = (opts ?? {}) as { limit?: number; offset?: number; query?: string };
      const result = await getPaginatedJobs(o.limit ?? 20, o.offset ?? 0, o.query, {
        includeNonTechnical: true,
      });
      return toPlain(result.items);
    },

    async companies(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number; query?: string };
      const result = await getPaginatedCompanies(o.limit ?? 20, o.offset ?? 0, o.query);
      return toPlain(result.items);
    },

    async groups(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number };
      const result = await getPaginatedGroups(o.limit ?? 20, o.offset ?? 0);
      return toPlain(result.items);
    },

    async people(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number; query?: string };
      const result = await getPaginatedPeople(o.limit ?? 20, o.offset ?? 0, o.query);
      return toPlain(result.items);
    },

    async technologies(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number };
      const all = await getAllTechnologies();
      const offset = o.offset ?? 0;
      return toPlain(all.slice(offset, offset + (o.limit ?? 20)));
    },

    async education(opts: unknown) {
      const o = (opts ?? {}) as { limit?: number; offset?: number };
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
      const o = (opts ?? {}) as { jobId?: number; action?: string };
      if (!o.jobId) throw new Error("jobId is required");
      if (!o.action) throw new Error("action is required (approve, approve-non-technical, hide)");

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
        default:
          throw new Error(`Unknown action "${o.action}". Use: approve, approve-non-technical, hide`);
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
      const o = (opts ?? {}) as {
        name?: string;
        website?: string;
        description?: string;
        location?: string;
        email?: string;
      };
      if (!o.name?.trim()) throw new Error("name is required");
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
      const o = (opts ?? {}) as {
        id?: number;
        name?: string;
        website?: string;
        description?: string;
        location?: string;
        email?: string;
        linkedin?: string;
        careersUrl?: string;
        visible?: boolean;
        technl?: boolean;
        genesis?: boolean;
      };
      if (!o.id) throw new Error("id is required");
      const existing = await getCompanyByIdRecord(o.id);
      if (!existing) throw new Error(`Company with id ${o.id} not found`);

      const updates: Record<string, unknown> = {};
      if (o.name !== undefined) updates.name = o.name.trim();
      if (o.website !== undefined) updates.website = o.website.trim() || null;
      if (o.description !== undefined) updates.description = o.description.trim();
      if (o.location !== undefined) updates.location = o.location.trim() || null;
      if (o.email !== undefined) updates.email = o.email.trim() || null;
      if (o.linkedin !== undefined) updates.linkedin = o.linkedin.trim() || null;
      if (o.careersUrl !== undefined) updates.careersUrl = o.careersUrl.trim() || null;
      if (o.visible !== undefined) updates.visible = o.visible;
      if (o.technl !== undefined) updates.technl = o.technl;
      if (o.genesis !== undefined) updates.genesis = o.genesis;

      if (Object.keys(updates).length === 0) {
        return { updated: false, message: "No fields to update" };
      }

      await updateCompanyRecord(o.id, updates);
      return toPlain({
        updated: true,
        message: `Company "${existing.name}" updated (${Object.keys(updates).join(", ")})`,
      });
    },

    async createJobSource(opts: unknown) {
      const o = (opts ?? {}) as {
        companyId?: number;
        sourceType?: string;
        sourceIdentifier?: string;
        sourceUrl?: string;
      };
      if (!o.companyId) throw new Error("companyId is required");
      if (!o.sourceType) throw new Error("sourceType is required");
      if (!o.sourceIdentifier?.trim()) throw new Error("sourceIdentifier is required");

      // Validate the source type is supported
      try {
        getImporter(o.sourceType as JobSourceType);
      } catch {
        throw new Error(
          `Unsupported sourceType "${o.sourceType}". Use listImporterTypes() to see available types.`,
        );
      }

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
          message: `Validation failed: ${validation.error}`,
        };
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
        message: `Job import source created (id: ${sourceId}). Use syncJobSource(${sourceId}) to run first sync.`,
        jobCount: validation.jobCount,
      };
    },

    async createEventSource(opts: unknown) {
      const o = (opts ?? {}) as {
        name?: string;
        sourceType?: string;
        sourceIdentifier?: string;
        sourceUrl?: string;
        organizer?: string;
      };
      if (!o.name?.trim()) throw new Error("name is required");
      if (!o.sourceType) throw new Error("sourceType is required");
      if (!o.sourceIdentifier?.trim()) throw new Error("sourceIdentifier is required");
      if (!o.sourceUrl?.trim()) throw new Error("sourceUrl is required");

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
  };
}
