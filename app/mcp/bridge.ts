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
  updateImportSource as updateJobImportSource,
  getSourceById,
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
import { createJob as createJobRecord, updateJob as updateJobRecord } from "~/lib/jobs.server";
import { searchIndeed, searchLinkedIn } from "~/lib/job-search.server";
import { db } from "~/db";
import { events, jobs, companies, eventImportSources, jobImportSources } from "~/db/schema";
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
  id: z.number("id is required"),
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
  companyId: z.number("companyId is required"),
  sourceType: z.string().min(1, "sourceType is required"),
  sourceIdentifier: z.string().min(1, "sourceIdentifier is required"),
  sourceUrl: z.string().optional(),
  skipValidation: z.boolean().optional(),
});

const UpdateJobSourceSchema = z.object({
  sourceId: z.number("sourceId is required"),
  sourceType: z.string().optional(),
  sourceIdentifier: z.string().optional(),
  sourceUrl: z.string().optional(),
});

const CreateEventSourceSchema = z.object({
  name: z.string().min(1, "name is required"),
  sourceType: z.string().min(1, "sourceType is required"),
  sourceIdentifier: z.string().min(1, "sourceIdentifier is required"),
  sourceUrl: z.string().min(1, "sourceUrl is required"),
  organizer: z.string().optional(),
});

const ReviewJobSchema = z.object({
  jobId: z.number("jobId is required"),
  action: z.enum(
    ["approve", "approve-non-technical", "hide"],
    "action is required (approve, approve-non-technical, hide)",
  ),
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
  jobId: z.number("jobId is required"),
  reason: z.enum(["removed", "filled", "expired"], "reason is required (removed, filled, expired)"),
});

const UpdateJobSchema = z.object({
  id: z.number("id is required"),
  title: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  location: z.string().optional(),
  department: z.string().optional(),
  workplaceType: z.enum(["remote", "onsite", "hybrid"]).optional(),
  salaryRange: z.string().optional(),
});

const SearchJobsSchema = z.object({
  query: z.string().optional(),
  location: z.string().default("St. John's, NL"),
  limit: z.number().default(25),
  hoursOld: z.number().optional(),
});

const SubmitNewsLinkSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  sourceName: z.string().optional(),
});

const CreateNewsArticleSchema = z.object({
  title: z.string().min(1, "title is required"),
  content: z.string().min(1, "content is required"),
  excerpt: z.string().optional(),
  publish: z.boolean().optional(),
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
      const rows = await db
        .select({
          sourceId: eventImportSources.id,
          sourceName: eventImportSources.name,
          eventId: events.id,
          title: events.title,
          firstSeenAt: events.firstSeenAt,
        })
        .from(events)
        .innerJoin(eventImportSources, eq(events.importSourceId, eventImportSources.id))
        .where(eq(events.importStatus, "pending_review"))
        .limit(200);
      return toPlain(rows);
    },

    async pendingJobs() {
      const rows = await db
        .select({
          jobId: jobs.id,
          title: jobs.title,
          companyName: companies.name,
          location: jobs.location,
          workplaceType: jobs.workplaceType,
          url: jobs.url,
          descriptionText: jobs.descriptionText,
          sourceType: jobImportSources.sourceType,
        })
        .from(jobs)
        .leftJoin(companies, eq(jobs.companyId, companies.id))
        .leftJoin(jobImportSources, eq(jobs.sourceId, jobImportSources.id))
        .where(eq(jobs.status, "pending_review"))
        .limit(200);

      return toPlain(
        rows.map((r) => ({
          ...r,
          descriptionSnippet: r.descriptionText
            ? r.descriptionText.slice(0, 500) + (r.descriptionText.length > 500 ? "..." : "")
            : null,
          descriptionText: undefined,
        })),
      );
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

    async updateJobSource(opts: unknown) {
      const o = UpdateJobSourceSchema.parse(opts ?? {});
      const existing = await getSourceById(o.sourceId);
      if (!existing) throw new Error(`Job import source ${o.sourceId} not found`);

      // Validate new sourceType if changing
      if (o.sourceType) {
        try {
          getImporter(o.sourceType as JobSourceType);
        } catch {
          throw new Error(
            `Unsupported sourceType "${o.sourceType}". Use listImporterTypes() to see available types.`,
          );
        }
      }

      const updates: { sourceType?: string; sourceIdentifier?: string; sourceUrl?: string | null } = {};
      if (o.sourceType) updates.sourceType = o.sourceType;
      if (o.sourceIdentifier) updates.sourceIdentifier = o.sourceIdentifier.trim();
      if (o.sourceUrl !== undefined) updates.sourceUrl = o.sourceUrl?.trim() || null;

      if (Object.keys(updates).length === 0) {
        return { updated: false, message: "No fields to update" };
      }

      await updateJobImportSource(o.sourceId, updates);
      return {
        updated: true,
        message: `Job import source ${o.sourceId} updated (${Object.keys(updates).join(", ")})`,
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
        eventCount: "eventCount" in validation ? validation.eventCount : undefined,
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
      const rows = await db
        .select({
          jobId: jobs.id,
          title: jobs.title,
          companyName: companies.name,
          location: jobs.location,
          workplaceType: jobs.workplaceType,
          url: jobs.url,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .leftJoin(companies, eq(jobs.companyId, companies.id))
        .where(and(eq(jobs.sourceType, "manual"), eq(jobs.status, "active")));
      return toPlain(rows);
    },

    async updateJob(opts: unknown) {
      const { id, ...fields } = UpdateJobSchema.parse(opts ?? {});
      const job = await getImportedJobById(id);
      if (!job) throw new Error(`Job ${id} not found`);

      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        if (typeof value === "string") {
          updates[key] = value.trim() || null;
        } else {
          updates[key] = value;
        }
      }

      if (Object.keys(updates).length === 0) {
        return { updated: false, message: "No fields to update" };
      }

      await updateJobRecord(id, updates);
      return {
        updated: true,
        message: `Job "${job.title}" updated (${Object.keys(updates).join(", ")})`,
      };
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

    async searchIndeedJobs(opts: unknown) {
      const o = SearchJobsSchema.parse(opts ?? {});
      return searchIndeed(o);
    },

    async searchLinkedInJobs(opts: unknown) {
      const o = SearchJobsSchema.parse(opts ?? {});
      return searchLinkedIn(o);
    },

    async submitNewsLink(opts: unknown) {
      const o = SubmitNewsLinkSchema.parse(opts ?? {});
      return submitNewsLink(o);
    },

    async createNewsArticle(opts: unknown) {
      const o = CreateNewsArticleSchema.parse(opts ?? {});
      return createNewsArticle(o);
    },

    async pendingNews() {
      return pendingNews();
    },

    async approveNews(id: unknown) {
      return approveNews(Number(id));
    },

    async hideNews(id: unknown) {
      return hideNews(Number(id));
    },
  };
}

// ---- News ----

export async function submitNewsLink(opts: z.infer<typeof SubmitNewsLinkSchema>) {
  let { url, title, excerpt, sourceName } = opts;
  // If title not provided, fetch the page and extract metadata
  if (!title) {
    const response = await fetch(url, { headers: { "User-Agent": "siliconharbour.dev" } });
    const html = await response.text();
    // Extract <title> tag
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
    // Extract meta description
    if (!excerpt) {
      const descMatch = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html);
      excerpt = descMatch ? descMatch[1].trim() : undefined;
    }
  }
  if (!sourceName) {
    sourceName = new URL(url).hostname.replace(/^www\./, "");
  }

  const { createNews } = await import("~/lib/news.server");
  const article = await createNews({
    type: "link",
    title,
    externalUrl: url,
    sourceName,
    content: excerpt || "",
    excerpt: excerpt || null,
    status: "published",
    publishedAt: new Date(),
  });
  return { id: article.id, slug: article.slug, title: article.title };
}

export async function createNewsArticle(opts: z.infer<typeof CreateNewsArticleSchema>) {
  const { title, content, excerpt, publish } = opts;
  const { createNews } = await import("~/lib/news.server");
  const article = await createNews({
    type: "article",
    title,
    content,
    excerpt: excerpt || null,
    status: publish ? "published" : "draft",
    publishedAt: publish ? new Date() : null,
  });
  return { id: article.id, slug: article.slug, title: article.title };
}

export async function pendingNews() {
  const { getAllPendingNews } = await import("~/lib/news-importers/sync.server");
  return getAllPendingNews();
}

export async function approveNews(id: number) {
  const { approveNewsItem } = await import("~/lib/news-importers/sync.server");
  await approveNewsItem(id);
  return { success: true };
}

export async function hideNews(id: number) {
  const { hideNewsItem } = await import("~/lib/news-importers/sync.server");
  await hideNewsItem(id);
  return { success: true };
}
