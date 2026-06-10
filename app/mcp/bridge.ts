/**
 * Host bridge: real DB/sync functions exposed directly into the QuickJS sandbox.
 * Each function is called on-demand by user code — no pre-fetching.
 */

import { z } from "zod";
import type { HostFunctions } from "./sandbox.js";
import { getAsyncSync, listAsyncSyncs, startAsyncSync } from "./async-syncs.js";
import {
  getUpcomingEvents,
  getPaginatedEvents,
  createEvent as createEventRecord,
} from "~/lib/events.server";
import { getPaginatedJobs } from "~/lib/jobs.server";
import { getPaginatedNews, getNewsById } from "~/lib/news.server";
import { getPaginatedCompanies } from "~/lib/companies.server";
import {
  getPaginatedGroups,
  createGroup as createGroupRecord,
  getGroupBySlug as getGroupBySlugRecord,
} from "~/lib/groups.server";
import {
  getPaginatedPeople,
  createPerson as createPersonRecord,
  updatePerson as updatePersonRecord,
  deletePerson as deletePersonRecord,
  getPersonBySlug as getPersonBySlugRecord,
} from "~/lib/people.server";
import {
  getAllTechnologies,
  createTechnology as createTechnologyRecord,
  updateTechnology as updateTechnologyRecord,
  deleteTechnology as deleteTechnologyRecord,
  getTechnologyBySlug as getTechnologyBySlugRecord,
} from "~/lib/technologies.server";
import {
  getPaginatedEducation,
  createEducation as createEducationRecord,
  updateEducation as updateEducationRecord,
  deleteEducation as deleteEducationRecord,
  getEducationBySlug as getEducationBySlugRecord,
} from "~/lib/education.server";
import {
  createProduct as createProductRecord,
  updateProduct as updateProductRecord,
  deleteProduct as deleteProductRecord,
  getProductBySlug as getProductBySlugRecord,
} from "~/lib/products.server";
import {
  createProject as createProjectRecord,
  updateProject as updateProjectRecord,
  deleteProject as deleteProjectRecord,
  getProjectBySlug as getProjectBySlugRecord,
} from "~/lib/projects.server";
import {
  getAllEventImportSources,
  syncEvents,
  createEventImportSource,
  validateEventImportSourceConfig,
  localDateTimeToUTC,
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
import {
  getAllNewsImportSources,
  getNewsSourceById,
  syncNewsSource as syncNewsSourceRecord,
  createNewsImportSource,
} from "~/lib/news-importers/sync.server";
import type { NewsSourceType, ExcerptMode } from "~/lib/news-importers/types";
import { fetchTechNLJobsWithMatches } from "~/lib/technl-jobs.server";
import { db } from "~/db";
import {
  events,
  jobs,
  companies,
  eventImportSources,
  jobImportSources,
  news,
} from "~/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";

// ── Host function documentation helper ─────────────────────────────────
// Wraps every host function exposed to the QuickJS sandbox with metadata
// stashed on the function itself. Consumed by:
//   - /api docs page (auto-generated tool listing per MCP tool)
//   - searchSpec()  ("siliconharbour module: ..." hints)
//   - server.ts     (renders the `execute` tool description prompt)
//
// Co-locating with the implementation means a new bridge function CANNOT
// drift — its docs travel with it, and getHostFunctionDocs() reads them
// straight off the live function references.

export type HostFnCategory =
  | "read"
  | "sources"
  | "pending"
  | "sync"
  | "async-sync"
  | "creation"
  | "lookup"
  | "search"
  | "lifecycle";

export interface HostFnDoc {
  signature: string;
  description: string;
  category: HostFnCategory;
}

type HostFn = (...args: unknown[]) => Promise<unknown>;
type DocumentedHostFn = HostFn & { __doc: HostFnDoc };

/**
 * Tag a host function with documentation. Returns the original function
 * unchanged (apart from a non-enumerable __doc property) so existing
 * call sites continue to work.
 */
function host<F extends HostFn>(
  signature: string,
  description: string,
  category: HostFnCategory,
  fn: F,
): F {
  Object.defineProperty(fn, "__doc", {
    value: { signature, description, category } satisfies HostFnDoc,
    enumerable: false,
    writable: false,
  });
  return fn;
}

/** Read the documentation off a host function, or null if untagged. */
export function getHostFnDoc(fn: unknown): HostFnDoc | null {
  if (typeof fn !== "function") return null;
  const doc = (fn as DocumentedHostFn).__doc;
  return doc ?? null;
}

export interface HostFunctionDocsEntry extends HostFnDoc {
  name: string;
  status: "documented" | "undocumented";
}

export interface HostFunctionDocs {
  /** Functions available via the public `query` MCP tool. */
  read: HostFunctionDocsEntry[];
  /** Functions available via the authenticated `execute` MCP tool (superset of read). */
  execute: HostFunctionDocsEntry[];
}

function entriesFor(fns: HostFunctions): HostFunctionDocsEntry[] {
  return Object.entries(fns)
    .map(([name, fn]) => {
      const doc = getHostFnDoc(fn);
      if (doc) {
        return { name, status: "documented" as const, ...doc };
      }
      return {
        name,
        status: "undocumented" as const,
        signature: `${name}(...)`,
        description:
          "(undocumented — wrap this function with host('signature', 'description', category, fn) in app/mcp/bridge.ts)",
        category: "read" as HostFnCategory,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Walks the live host-function bindings and pulls __doc off each entry.
 * Used by the /api docs page, the searchSpec module hints, and server.ts
 * to build the `execute` tool description prompt — so there is exactly
 * one source of truth (the call site in this file).
 */
export function getHostFunctionDocs(): HostFunctionDocs {
  return {
    read: entriesFor(buildReadFunctions()),
    execute: entriesFor(buildExecuteFunctions()),
  };
}

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

const CreateGroupSchema = z.object({
  name: z.string().min(1, "name is required"),
  description: z.string().min(1, "description is required"),
  website: z.string().optional(),
  meetingFrequency: z.string().optional(),
  visible: z.boolean().optional(),
});

// ── Union CRUD for entities with uniform shape ─────────────────────────
//
// Five entities (person, education, product, project, technology) share
// the same pattern: slug auto-generated from name, optional logo/cover,
// boolean visibility. Rather than expose 15 distinct host functions, we
// dispatch through createEntity / updateEntity / deleteEntity / getEntityBySlug
// keyed on a `type` discriminator. Bespoke functions stay for entities
// whose shape genuinely differs (events, jobs, news).

const ENTITY_TYPES = ["person", "education", "product", "project", "technology"] as const;

const PersonCreateSchema = z.object({
  type: z.literal("person"),
  name: z.string().min(1, "name is required"),
  bio: z.string().min(1, "bio is required"),
  website: z.string().optional(),
  github: z.string().optional(),
  visible: z.boolean().optional(),
});

const EducationCreateSchema = z.object({
  type: z.literal("education"),
  name: z.string().min(1, "name is required"),
  description: z.string().min(1, "description is required"),
  educationType: z.enum(["university", "college", "bootcamp", "online", "other"]).optional(),
  website: z.string().optional(),
  technl: z.boolean().optional(),
  genesis: z.boolean().optional(),
  bounce: z.boolean().optional(),
  visible: z.boolean().optional(),
});

const ProductCreateSchema = z.object({
  type: z.literal("product"),
  name: z.string().min(1, "name is required"),
  description: z.string().min(1, "description is required"),
  productType: z.enum(["saas", "mobile", "physical", "service", "other"]).optional(),
  website: z.string().optional(),
  companyId: z.number().optional(),
});

const ProjectCreateSchema = z.object({
  type: z.literal("project"),
  name: z.string().min(1, "name is required"),
  description: z.string().min(1, "description is required"),
  projectType: z.enum(["game", "webapp", "library", "tool", "hardware", "other"]).optional(),
  status: z.enum(["active", "completed", "archived", "on-hold"]).optional(),
});

const TechnologyCreateSchema = z.object({
  type: z.literal("technology"),
  name: z.string().min(1, "name is required"),
  category: z.enum([
    "language",
    "frontend",
    "backend",
    "cloud",
    "database",
    "games-and-graphics",
    "mobile",
    "data-science",
    "llm",
    "platform",
    "specialized",
  ]),
  description: z.string().optional(),
  website: z.string().optional(),
  visible: z.boolean().optional(),
});

const CreateEntitySchema = z.discriminatedUnion("type", [
  PersonCreateSchema,
  EducationCreateSchema,
  ProductCreateSchema,
  ProjectCreateSchema,
  TechnologyCreateSchema,
]);

// Update schemas: same fields as create, but all optional + an id.
// Each entity update accepts a Partial of its create shape.
const UpdateEntitySchema = z.discriminatedUnion("type", [
  PersonCreateSchema.partial({
    name: true,
    bio: true,
    website: true,
    github: true,
    visible: true,
  }).extend({ type: z.literal("person"), id: z.number("id is required") }),
  EducationCreateSchema.partial({
    name: true,
    description: true,
    educationType: true,
    website: true,
    technl: true,
    genesis: true,
    bounce: true,
    visible: true,
  }).extend({ type: z.literal("education"), id: z.number("id is required") }),
  ProductCreateSchema.partial({
    name: true,
    description: true,
    productType: true,
    website: true,
    companyId: true,
  }).extend({ type: z.literal("product"), id: z.number("id is required") }),
  ProjectCreateSchema.partial({
    name: true,
    description: true,
    projectType: true,
    status: true,
  }).extend({ type: z.literal("project"), id: z.number("id is required") }),
  TechnologyCreateSchema.partial({
    name: true,
    category: true,
    description: true,
    website: true,
    visible: true,
  }).extend({ type: z.literal("technology"), id: z.number("id is required") }),
]);

const DeleteEntitySchema = z.object({
  type: z.enum(ENTITY_TYPES),
  id: z.number("id is required"),
});

const GetEntityBySlugSchema = z.object({
  type: z.enum(ENTITY_TYPES),
  slug: z.string().min(1, "slug is required"),
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

const CreateEventSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().min(1, "description is required"),
  link: z.string().min(1, "link is required (external URL such as the LinkedIn event URL)"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD")
    .optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "startTime must be HH:mm (24h, local time in America/St_Johns)")
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "endTime must be HH:mm (24h, local time in America/St_Johns)")
    .optional(),
  location: z.string().optional(),
  organizer: z.string().optional(),
  requiresSignup: z.boolean().optional(),
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

const CreateNewsSourceSchema = z.object({
  name: z.string().min(1, "name is required"),
  sourceType: z.enum(["rss", "custom"], "sourceType must be rss or custom"),
  sourceUrl: z.string().url("sourceUrl must be a valid URL"),
  sourceIdentifier: z.string().optional(),
  keywords: z.string().optional(),
  useGlobalKeywords: z.boolean().optional(),
  excerptMode: z.enum(["description", "content", "none"]).optional(),
  entityUrl: z.string().optional(),
  enabled: z.boolean().optional(),
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
    events: host(
      "events({ upcoming?, limit?, offset?, query? })",
      "List events. Pass upcoming:true to limit to future events. Defaults to limit 20.",
      "read",
      async (opts: unknown) => {
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
    ),

    jobs: host(
      "jobs({ query?, limit?, offset? })",
      "List active jobs (includes both technical and non-technical postings). Optional text query searches indexed content.",
      "read",
      async (opts: unknown) => {
        const o = PaginationSchema.parse(opts ?? {});
        const result = await getPaginatedJobs(o.limit ?? 20, o.offset ?? 0, o.query, {
          includeNonTechnical: true,
        });
        return toPlain(result.items);
      },
    ),

    companies: host(
      "companies({ query?, limit?, offset? })",
      "List visible companies. Optional query filters by name and description.",
      "read",
      async (opts: unknown) => {
        const o = PaginationSchema.parse(opts ?? {});
        const result = await getPaginatedCompanies(o.limit ?? 20, o.offset ?? 0, o.query);
        return toPlain(result.items);
      },
    ),

    groups: host(
      "groups({ limit?, offset? })",
      "List community groups.",
      "read",
      async (opts: unknown) => {
        const o = PaginationSchema.parse(opts ?? {});
        const result = await getPaginatedGroups(o.limit ?? 20, o.offset ?? 0);
        return toPlain(result.items);
      },
    ),

    people: host(
      "people({ query?, limit?, offset? })",
      "List visible people from the directory.",
      "read",
      async (opts: unknown) => {
        const o = PaginationSchema.parse(opts ?? {});
        const result = await getPaginatedPeople(o.limit ?? 20, o.offset ?? 0, o.query);
        return toPlain(result.items);
      },
    ),

    technologies: host(
      "technologies({ limit?, offset? })",
      "List technologies referenced across the directory.",
      "read",
      async (opts: unknown) => {
        const o = PaginationSchema.parse(opts ?? {});
        const all = await getAllTechnologies();
        const offset = o.offset ?? 0;
        return toPlain(all.slice(offset, offset + (o.limit ?? 20)));
      },
    ),

    education: host(
      "education({ limit?, offset? })",
      "List educational institutions and programs.",
      "read",
      async (opts: unknown) => {
        const o = PaginationSchema.parse(opts ?? {});
        const result = await getPaginatedEducation(o.limit ?? 20, o.offset ?? 0);
        return toPlain(result.items);
      },
    ),

    news: host(
      "news({ query?, limit?, offset? })",
      "List published news items. Optional query filters by indexed content.",
      "read",
      async (opts: unknown) => {
        const o = PaginationSchema.parse(opts ?? {});
        const result = await getPaginatedNews(o.limit ?? 20, o.offset ?? 0, o.query);
        return toPlain(result.items);
      },
    ),
  };
}

/** Execute host functions — superset of read, adds sync and pending actions */
export function buildExecuteFunctions(): HostFunctions {
  return {
    ...buildReadFunctions(),

    eventImportSources: host(
      "eventImportSources()",
      "List all event import sources with id, sourceType, fetchStatus, lastFetchedAt, and pendingCount.",
      "sources",
      async () => {
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
    ),

    jobImportSources: host(
      "jobImportSources()",
      "List all job import sources with id, sourceType, fetchStatus, and lastFetchedAt.",
      "sources",
      async () => {
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
    ),

    newsImportSources: host(
      "newsImportSources()",
      "List all news import sources (RSS feeds and custom) with enabled flag, lastSyncStatus, and pendingCount.",
      "sources",
      async () => {
        const sources = await getAllNewsImportSources();
        // Enrich with pendingCount (news.status = 'pending_review' per source).
        // This mirrors the way eventImportSources is shaped on its caller side.
        const enriched = await Promise.all(
          sources.map(async (s) => {
            const [row] = await db
              .select({ pending: count() })
              .from(news)
              .where(and(eq(news.sourceId, s.id), eq(news.status, "pending_review")));
            return {
              id: s.id,
              name: s.name,
              sourceType: s.sourceType,
              sourceUrl: s.sourceUrl,
              enabled: s.enabled,
              lastSyncAt: s.lastSyncAt,
              lastSyncStatus: s.lastSyncStatus,
              lastSyncError: s.lastSyncError,
              useGlobalKeywords: s.useGlobalKeywords,
              keywords: s.keywords,
              excerptMode: s.excerptMode,
              entityUrl: s.entityUrl,
              pendingCount: row?.pending ?? 0,
            };
          }),
        );
        return toPlain(enriched);
      },
    ),

    pendingEvents: host(
      "pendingEvents()",
      "List events with importStatus='pending_review' — i.e. waiting on admin approval. Returns sourceId, sourceName, eventId, title, firstSeenAt.",
      "pending",
      async () => {
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
    ),

    pendingJobs: host(
      "pendingJobs()",
      "List jobs with status='pending_review'. Returns title, company, location, workplaceType, descriptionSnippet, URL.",
      "pending",
      async () => {
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
    ),

    getJobDetail: host(
      "getJobDetail(jobId)",
      "Full job record including descriptionText. Use this when pendingJobs() snippet isn't enough to decide.",
      "lookup",
      async (jobId: unknown) => {
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
    ),

    getNewsDetail: host(
      "getNewsDetail(id)",
      "Full news record including content body and resolved source info. Use after pendingNews() to read before approving.",
      "lookup",
      async (id: unknown) => {
        const item = await getNewsById(Number(id));
        if (!item) return { found: false, message: `News ${id} not found` };
        // Resolve the source name if this came from an import source.
        const source = item.sourceId ? await getNewsSourceById(item.sourceId) : null;
        return toPlain({
          found: true,
          news: {
            id: item.id,
            slug: item.slug,
            type: item.type,
            title: item.title,
            externalUrl: item.externalUrl,
            sourceName: item.sourceName,
            sourceEntityUrl: item.sourceEntityUrl,
            sourceType: source?.sourceType ?? null,
            sourceUrl: source?.sourceUrl ?? null,
            excerpt: item.excerpt,
            content: item.content,
            coverImage: item.coverImage,
            status: item.status,
            publishedAt: item.publishedAt,
            createdAt: item.createdAt,
          },
        });
      },
    ),

    reviewJob: host(
      "reviewJob({ jobId, action }) where action is 'approve' | 'approve-non-technical' | 'hide'",
      "Move a pending_review job to its final state. 'approve' = technical+published, 'approve-non-technical' = published but deprioritized, 'hide' = remove from public.",
      "lifecycle",
      async (opts: unknown) => {
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
    ),

    syncEventSource: host(
      "syncEventSource(sourceId)",
      "Run a sync for a single event import source.",
      "sync",
      async (sourceId: unknown) => {
        return toPlain(await syncEvents(Number(sourceId)));
      },
    ),

    syncAllEventSources: host(
      "syncAllEventSources()",
      "Synchronously sync all event sources sequentially. Returns per-source results.",
      "sync",
      async () => {
        const sources = await getAllEventImportSources();
        const results = [];
        for (const source of sources) {
          const result = await syncEvents(source.id);
          results.push({ sourceId: source.id, name: source.name, ...result });
        }
        return toPlain(results);
      },
    ),

    syncJobSource: host(
      "syncJobSource(sourceId)",
      "Run a sync for a single job import source.",
      "sync",
      async (sourceId: unknown) => {
        return toPlain(await syncJobs(Number(sourceId)));
      },
    ),

    syncAllJobSources: host(
      "syncAllJobSources()",
      "Synchronously sync all job sources sequentially.",
      "sync",
      async () => {
        const sources = await getAllImportSources();
        const results = [];
        for (const source of sources) {
          const result = await syncJobs(source.id);
          results.push({ sourceId: source.id, name: source.sourceIdentifier, ...result });
        }
        return toPlain(results);
      },
    ),

    syncNewsSource: host(
      "syncNewsSource(sourceId)",
      "Run a sync for a single news import source.",
      "sync",
      async (sourceId: unknown) => {
        return toPlain(await syncNewsSourceRecord(Number(sourceId)));
      },
    ),

    syncAllNewsSources: host(
      "syncAllNewsSources()",
      "Synchronously sync all enabled news sources sequentially. Returns per-source results.",
      "sync",
      async () => {
        // Mirrors syncAllJobSources shape so callers can iterate per-source results
        // (the underlying syncAllNewsSources() returns aggregate totals only).
        const sources = await getAllNewsImportSources();
        const results = [];
        for (const source of sources) {
          if (!source.enabled) continue;
          const result = await syncNewsSourceRecord(source.id);
          results.push({ sourceId: source.id, name: source.name, ...result });
        }
        return toPlain(results);
      },
    ),

    asyncSyncAllEventSources: host(
      "asyncSyncAllEventSources()",
      "Start a background sync of all event sources and return immediately with a runId. Poll via getAsyncSync(runId).",
      "async-sync",
      async () => {
        const sources = await getAllEventImportSources();
        return toPlain(
          startAsyncSync(
            sources.map((source) => ({
              type: "event" as const,
              sourceId: source.id,
              name: source.name,
              run: () => syncEvents(source.id),
            })),
          ),
        );
      },
    ),

    asyncSyncAllJobSources: host(
      "asyncSyncAllJobSources()",
      "Start a background sync of all job sources. Returns a runId.",
      "async-sync",
      async () => {
        const sources = await getAllImportSources();
        return toPlain(
          startAsyncSync(
            sources.map((source) => ({
              type: "job" as const,
              sourceId: source.id,
              name: source.sourceIdentifier,
              run: () => syncJobs(source.id),
            })),
          ),
        );
      },
    ),

    asyncSyncAllNewsSources: host(
      "asyncSyncAllNewsSources()",
      "Start a background sync of all enabled news sources. Returns a runId.",
      "async-sync",
      async () => {
        const sources = await getAllNewsImportSources();
        return toPlain(
          startAsyncSync(
            sources
              .filter((source) => source.enabled)
              .map((source) => ({
                type: "news" as const,
                sourceId: source.id,
                name: source.name,
                run: () => syncNewsSourceRecord(source.id),
              })),
          ),
        );
      },
    ),

    asyncSyncAllSources: host(
      "asyncSyncAllSources()",
      "Start a background sync of every event, job, and news source in one run. Returns a runId.",
      "async-sync",
      async () => {
        const [eventSources, jobSources, newsSources] = await Promise.all([
          getAllEventImportSources(),
          getAllImportSources(),
          getAllNewsImportSources(),
        ]);
        return toPlain(
          startAsyncSync([
            ...eventSources.map((source) => ({
              type: "event" as const,
              sourceId: source.id,
              name: source.name,
              run: () => syncEvents(source.id),
            })),
            ...jobSources.map((source) => ({
              type: "job" as const,
              sourceId: source.id,
              name: source.sourceIdentifier,
              run: () => syncJobs(source.id),
            })),
            ...newsSources
              .filter((source) => source.enabled)
              .map((source) => ({
                type: "news" as const,
                sourceId: source.id,
                name: source.name,
                run: () => syncNewsSourceRecord(source.id),
              })),
          ]),
        );
      },
    ),

    getAsyncSync: host(
      "getAsyncSync(runId)",
      "Get the live status of a background sync run: { status, completed, failed, current, steps[] }.",
      "async-sync",
      async (runId: unknown) => {
        if (!runId || typeof runId !== "string") throw new Error("runId is required (string)");
        return toPlain(getAsyncSync(runId) ?? { found: false, runId });
      },
    ),

    listAsyncSyncs: host(
      "listAsyncSyncs()",
      "List recent background sync runs (most recent first, max 20 stored).",
      "async-sync",
      async () => {
        return toPlain(listAsyncSyncs());
      },
    ),

    // ── Entity creation ──────────────────────────────────────────────

    createCompany: host(
      "createCompany({ name, website?, description?, location?, email? })",
      "Create a new company. Created hidden (visible=false) so an admin can review before publishing.",
      "creation",
      async (opts: unknown) => {
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
    ),

    getCompanyByName: host(
      "getCompanyByName(name)",
      "Look up a company by name (exact match). Used to resolve companyId before createJob.",
      "lookup",
      async (name: unknown) => {
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
    ),

    createGroup: host(
      "createGroup({ name, description, website?, meetingFrequency?, visible? })",
      "Create a new community group. Created hidden (visible=false) by default so an admin can review and add a logo/cover before publishing — pass visible=true to publish immediately.",
      "creation",
      async (opts: unknown) => {
        const o = CreateGroupSchema.parse(opts ?? {});
        const group = await createGroupRecord({
          name: o.name.trim(),
          description: o.description.trim(),
          website: o.website?.trim() || null,
          meetingFrequency: o.meetingFrequency?.trim() || null,
          logo: null,
          coverImage: null,
          visible: o.visible ?? false,
        });
        return toPlain({
          created: true,
          message: `Group "${group.name}" created${group.visible ? "" : " (hidden, pending review)"}. View at /manage/groups/${group.id}`,
          group: { id: group.id, name: group.name, slug: group.slug, visible: group.visible },
        });
      },
    ),

    getGroupBySlug: host(
      "getGroupBySlug(slug)",
      "Look up a community group by slug. Returns id, name, slug, website, meetingFrequency, visible.",
      "lookup",
      async (slug: unknown) => {
        if (!slug || typeof slug !== "string") throw new Error("slug is required (string)");
        const group = await getGroupBySlugRecord(slug.trim());
        if (!group) return { found: false, message: `No group found with slug "${slug}"` };
        return toPlain({
          found: true,
          group: {
            id: group.id,
            name: group.name,
            slug: group.slug,
            website: group.website,
            meetingFrequency: group.meetingFrequency,
            visible: group.visible,
          },
        });
      },
    ),

    updateCompany: host(
      "updateCompany({ id, name?, website?, description?, location?, email?, linkedin?, github?, wikipedia?, careersUrl?, founded?, visible?, technl?, genesis?, bounce? })",
      "Patch fields on an existing company.",
      "creation",
      async (opts: unknown) => {
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
    ),

    createJobSource: host(
      "createJobSource({ companyId, sourceType, sourceIdentifier, sourceUrl?, skipValidation? })",
      "Register a new job import source (greenhouse, ashby, workday, lever, custom, etc.). Validates the config before saving unless skipValidation is true.",
      "creation",
      async (opts: unknown) => {
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
    ),

    updateJobSource: host(
      "updateJobSource({ sourceId, sourceType?, sourceIdentifier?, sourceUrl? })",
      "Patch an existing job import source.",
      "creation",
      async (opts: unknown) => {
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
    ),

    createEventSource: host(
      "createEventSource({ name, sourceType, sourceIdentifier, sourceUrl, organizer? })",
      "Register a new event import source (luma-user, luma-calendar, technl, eventbrite, bevy, meetup, netbenefit). Validates the config before saving.",
      "creation",
      async (opts: unknown) => {
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
    ),

    createNewsSource: host(
      "createNewsSource({ name, sourceType, sourceUrl, sourceIdentifier?, keywords?, useGlobalKeywords?, excerptMode?, entityUrl?, enabled? })",
      "Register a new news import source (sourceType: 'rss' or 'custom'). For RSS, sourceUrl is the feed URL.",
      "creation",
      async (opts: unknown) => {
        const o = CreateNewsSourceSchema.parse(opts ?? {});

        const source = await createNewsImportSource({
          name: o.name.trim(),
          sourceType: o.sourceType as NewsSourceType,
          sourceUrl: o.sourceUrl.trim(),
          sourceIdentifier: o.sourceIdentifier?.trim() || null,
          keywords: o.keywords?.trim() || null,
          useGlobalKeywords: o.useGlobalKeywords ?? false,
          excerptMode: (o.excerptMode as ExcerptMode | undefined) ?? "description",
          entityUrl: o.entityUrl?.trim() || null,
          enabled: o.enabled ?? true,
        });

        return toPlain({
          created: true,
          sourceId: source.id,
          message: `News import source "${o.name}" created (id: ${source.id}). Use syncNewsSource(${source.id}) to run first sync.`,
        });
      },
    ),

    listImporterTypes: host(
      "listImporterTypes()",
      "Return metadata for every job importer type (greenhouse, ashby, workday, bamboohr, lever, custom, etc.) — name, approach, reliability, quirks.",
      "sources",
      async () => {
        return getAllImporterMeta();
      },
    ),

    createEntity: host(
      "createEntity({ type: 'person'|'education'|'product'|'project'|'technology', ...fields })",
      "Create a directory entity. Dispatches by `type` to the matching lib createX(). Slug is auto-generated from name. Default visible=false where applicable so an admin can review and add a logo/cover before publishing — pass visible=true to publish immediately. Use search('createEntity person') (or any entity name) to see the per-type field requirements.",
      "creation",
      async (opts: unknown) => {
        const o = CreateEntitySchema.parse(opts ?? {});

        switch (o.type) {
          case "person": {
            const person = await createPersonRecord({
              name: o.name.trim(),
              bio: o.bio.trim(),
              website: o.website?.trim() || null,
              github: o.github?.trim() || null,
              avatar: null,
              socialLinks: null,
              visible: o.visible ?? false,
            });
            return toPlain({
              created: true,
              type: "person",
              message: `Person "${person.name}" created${person.visible ? "" : " (hidden, pending review)"}. View at /manage/people/${person.id}`,
              entity: { id: person.id, name: person.name, slug: person.slug, visible: person.visible },
            });
          }
          case "education": {
            const item = await createEducationRecord({
              name: o.name.trim(),
              description: o.description.trim(),
              type: o.educationType ?? "other",
              website: o.website?.trim() || null,
              logo: null,
              coverImage: null,
              technl: o.technl ?? false,
              genesis: o.genesis ?? false,
              bounce: o.bounce ?? false,
              visible: o.visible ?? false,
            });
            return toPlain({
              created: true,
              type: "education",
              message: `Education "${item.name}" created${item.visible ? "" : " (hidden, pending review)"}. View at /manage/education/${item.id}`,
              entity: { id: item.id, name: item.name, slug: item.slug, visible: item.visible },
            });
          }
          case "product": {
            const product = await createProductRecord({
              name: o.name.trim(),
              description: o.description.trim(),
              type: o.productType ?? "other",
              website: o.website?.trim() || null,
              companyId: o.companyId ?? null,
              logo: null,
              coverImage: null,
            });
            return toPlain({
              created: true,
              type: "product",
              message: `Product "${product.name}" created. View at /manage/products/${product.id}`,
              entity: { id: product.id, name: product.name, slug: product.slug },
            });
          }
          case "project": {
            const project = await createProjectRecord({
              name: o.name.trim(),
              description: o.description.trim(),
              type: o.projectType ?? "other",
              status: o.status ?? "active",
              logo: null,
              coverImage: null,
              links: null,
            });
            return toPlain({
              created: true,
              type: "project",
              message: `Project "${project.name}" created. View at /manage/projects/${project.id}`,
              entity: { id: project.id, name: project.name, slug: project.slug },
            });
          }
          case "technology": {
            const tech = await createTechnologyRecord({
              name: o.name.trim(),
              category: o.category,
              description: o.description?.trim() || null,
              website: o.website?.trim() || null,
              icon: null,
              visible: o.visible ?? false,
            });
            return toPlain({
              created: true,
              type: "technology",
              message: `Technology "${tech.name}" created${tech.visible ? "" : " (hidden, pending review)"}. View at /manage/technologies/${tech.id}`,
              entity: { id: tech.id, name: tech.name, slug: tech.slug, visible: tech.visible },
            });
          }
        }
      },
    ),

    updateEntity: host(
      "updateEntity({ type, id, ...fields })",
      "Patch fields on a directory entity. Same `type` discriminator as createEntity. All fields except `type` and `id` are optional — only supplied fields are updated. Use search('updateEntity') for the per-type field list.",
      "creation",
      async (opts: unknown) => {
        const o = UpdateEntitySchema.parse(opts ?? {});

        // Each branch trims strings and converts empty to null (matching the
        // updateCompany convention). The lib updateX functions take a Partial,
        // so undefined fields are skipped naturally.
        const trim = (v: string | undefined): string | null | undefined =>
          v === undefined ? undefined : v.trim() || null;

        switch (o.type) {
          case "person": {
            const updated = await updatePersonRecord(o.id, {
              ...(o.name !== undefined && { name: o.name.trim() }),
              ...(o.bio !== undefined && { bio: o.bio.trim() }),
              ...(o.website !== undefined && { website: trim(o.website) }),
              ...(o.github !== undefined && { github: trim(o.github) }),
              ...(o.visible !== undefined && { visible: o.visible }),
            });
            if (!updated) throw new Error(`Person ${o.id} not found`);
            return toPlain({ updated: true, type: "person", message: `Person "${updated.name}" updated` });
          }
          case "education": {
            const updated = await updateEducationRecord(o.id, {
              ...(o.name !== undefined && { name: o.name.trim() }),
              ...(o.description !== undefined && { description: o.description.trim() }),
              ...(o.educationType !== undefined && { type: o.educationType }),
              ...(o.website !== undefined && { website: trim(o.website) }),
              ...(o.technl !== undefined && { technl: o.technl }),
              ...(o.genesis !== undefined && { genesis: o.genesis }),
              ...(o.bounce !== undefined && { bounce: o.bounce }),
              ...(o.visible !== undefined && { visible: o.visible }),
            });
            if (!updated) throw new Error(`Education ${o.id} not found`);
            return toPlain({ updated: true, type: "education", message: `Education "${updated.name}" updated` });
          }
          case "product": {
            const updated = await updateProductRecord(o.id, {
              ...(o.name !== undefined && { name: o.name.trim() }),
              ...(o.description !== undefined && { description: o.description.trim() }),
              ...(o.productType !== undefined && { type: o.productType }),
              ...(o.website !== undefined && { website: trim(o.website) }),
              ...(o.companyId !== undefined && { companyId: o.companyId }),
            });
            if (!updated) throw new Error(`Product ${o.id} not found`);
            return toPlain({ updated: true, type: "product", message: `Product "${updated.name}" updated` });
          }
          case "project": {
            const updated = await updateProjectRecord(o.id, {
              ...(o.name !== undefined && { name: o.name.trim() }),
              ...(o.description !== undefined && { description: o.description.trim() }),
              ...(o.projectType !== undefined && { type: o.projectType }),
              ...(o.status !== undefined && { status: o.status }),
            });
            if (!updated) throw new Error(`Project ${o.id} not found`);
            return toPlain({ updated: true, type: "project", message: `Project "${updated.name}" updated` });
          }
          case "technology": {
            const updated = await updateTechnologyRecord(o.id, {
              ...(o.name !== undefined && { name: o.name.trim() }),
              ...(o.category !== undefined && { category: o.category }),
              ...(o.description !== undefined && { description: trim(o.description) }),
              ...(o.website !== undefined && { website: trim(o.website) }),
              ...(o.visible !== undefined && { visible: o.visible }),
            });
            if (!updated) throw new Error(`Technology ${o.id} not found`);
            return toPlain({ updated: true, type: "technology", message: `Technology "${updated.name}" updated` });
          }
        }
      },
    ),

    deleteEntity: host(
      "deleteEntity({ type, id })",
      "Delete a directory entity by id. Same `type` discriminator as createEntity. Use with care — there is no undo.",
      "creation",
      async (opts: unknown) => {
        const o = DeleteEntitySchema.parse(opts ?? {});
        const ok = await (async () => {
          switch (o.type) {
            case "person":
              return deletePersonRecord(o.id);
            case "education":
              return deleteEducationRecord(o.id);
            case "product":
              return deleteProductRecord(o.id);
            case "project":
              return deleteProjectRecord(o.id);
            case "technology":
              return deleteTechnologyRecord(o.id);
          }
        })();
        return { deleted: ok, type: o.type, id: o.id };
      },
    ),

    getEntityBySlug: host(
      "getEntityBySlug({ type, slug })",
      "Look up a directory entity by slug. Same `type` discriminator as createEntity. Returns { found: true, entity: {...} } or { found: false }.",
      "lookup",
      async (opts: unknown) => {
        const o = GetEntityBySlugSchema.parse(opts ?? {});
        const entity = await (async () => {
          switch (o.type) {
            case "person":
              return getPersonBySlugRecord(o.slug);
            case "education":
              return getEducationBySlugRecord(o.slug);
            case "product":
              return getProductBySlugRecord(o.slug);
            case "project":
              return getProjectBySlugRecord(o.slug);
            case "technology":
              return getTechnologyBySlugRecord(o.slug);
          }
        })();
        if (!entity) return { found: false, type: o.type, message: `No ${o.type} found with slug "${o.slug}"` };
        return toPlain({ found: true, type: o.type, entity });
      },
    ),

    createJob: host(
      "createJob({ title, description, url, companyName?, companyId?, location?, department?, workplaceType?, salaryRange?, isTechnical? })",
      "Create a manual job posting (active immediately). Pass companyName to auto-resolve the company id.",
      "creation",
      async (opts: unknown) => {
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
    ),

    getManualJobs: host(
      "getManualJobs()",
      "All active manually-created jobs (sourceType='manual') with URLs — useful for periodic liveness checks.",
      "lookup",
      async () => {
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
    ),

    updateJob: host(
      "updateJob({ id, title?, description?, url?, location?, department?, workplaceType?, salaryRange? })",
      "Patch fields on a job. Trims string fields; empty string clears the field.",
      "creation",
      async (opts: unknown) => {
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
    ),

    deactivateJob: host(
      "deactivateJob({ jobId, reason }) where reason is 'removed' | 'filled' | 'expired'",
      "Mark a job inactive. Use for manual jobs whose links have gone dead, or when filled.",
      "lifecycle",
      async (opts: unknown) => {
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
    ),

    createEvent: host(
      "createEvent({ title, description, link, startDate, endDate?, startTime?, endTime?, location?, organizer?, requiresSignup? })",
      "Create a one-time event. Dates are YYYY-MM-DD, times are HH:mm (America/St_Johns). Events land in pending_review (hidden) so you can add cover/icon images and publish via /manage/events/{id}.",
      "creation",
      async (opts: unknown) => {
        const o = CreateEventSchema.parse(opts ?? {});

        // All manual events are anchored to America/St_Johns local time.
        // If endDate omitted, treat as same-day event.
        const tz = "America/St_Johns";
        const startDate = localDateTimeToUTC(o.startDate, o.startTime ?? null, tz);
        const endDate =
          o.endDate || o.endTime
            ? localDateTimeToUTC(o.endDate ?? o.startDate, o.endTime ?? o.startTime ?? null, tz)
            : null;

        const event = await createEventRecord(
          {
            title: o.title.trim(),
            description: o.description.trim(),
            link: o.link.trim(),
            location: o.location?.trim() || null,
            organizer: o.organizer?.trim() || null,
            coverImage: null,
            iconImage: null,
            coverImageUrl: null,
            requiresSignup: o.requiresSignup ?? false,
            // Hidden from public listings until an admin uploads a cover/icon
            // image and clicks Save & Publish at /manage/events/{id}. The
            // visibility filter used everywhere is
            // `importStatus IS NULL OR = 'published'`.
            importStatus: "pending_review",
          },
          [{ startDate, endDate }],
        );

        return toPlain({
          created: true,
          eventId: event.id,
          slug: event.slug,
          importStatus: "pending_review",
          message: `Event "${o.title}" created (pending review, hidden from public). Add cover/icon images and click Save & Publish at /manage/events/${event.id}`,
        });
      },
    ),

    getManualEvents: host(
      "getManualEvents()",
      "All events not tied to an import source (created via createEvent or the admin UI). Returns importStatus, coverImage, and iconImage so you can spot ones still needing artwork.",
      "lookup",
      async () => {
        // Manual events are those not tied to an import source.
        // Includes both published events and ones still pending review
        // (i.e. awaiting cover/icon images before going public).
        const rows = await db
          .select({
            eventId: events.id,
            title: events.title,
            slug: events.slug,
            link: events.link,
            location: events.location,
            organizer: events.organizer,
            importStatus: events.importStatus,
            coverImage: events.coverImage,
            iconImage: events.iconImage,
            createdAt: events.createdAt,
          })
          .from(events)
          .where(isNull(events.importSourceId));
        return toPlain(rows);
      },
    ),

    searchIndeedJobs: host(
      "searchIndeedJobs({ query?, location?, limit?, hoursOld? })",
      "Search Indeed via their mobile GraphQL API. Returns id, title, company, location, description, salary, datePosted. Default location: \"St. John's, NL\".",
      "search",
      async (opts: unknown) => {
        const o = SearchJobsSchema.parse(opts ?? {});
        return searchIndeed(o);
      },
    ),

    searchLinkedInJobs: host(
      "searchLinkedInJobs({ query?, location?, limit? })",
      "Search LinkedIn via the public jobs-guest endpoint. No authentication required. Returns id, title, company, location, url, datePosted, salary.",
      "search",
      async (opts: unknown) => {
        const o = SearchJobsSchema.parse(opts ?? {});
        return searchLinkedIn(o);
      },
    ),

    listTechNLJobs: host(
      "listTechNLJobs()",
      "Live technl.ca job board with company-match info so you can spot which postings we already have via createJob or an importer.",
      "search",
      async () => {
        const result = await fetchTechNLJobsWithMatches();
        // Trim heavy fields by default — descriptionHtml is large and
        // descriptionText is the useful summary. Callers wanting the full
        // HTML can fetch the individual posting via the link.
        return toPlain(
          result.jobs.map((j) => ({
            title: j.title,
            company: j.company,
            location: j.location,
            jobType: j.jobType,
            salary: j.salary,
            link: j.link,
            postedAt: j.postedAt,
            descriptionSnippet:
              j.descriptionText.length > 600
                ? `${j.descriptionText.slice(0, 600)}...`
                : j.descriptionText,
            match: j.match,
          })),
        );
      },
    ),

    getTechNLJob: host(
      "getTechNLJob(link)",
      "Full HTML/text description for one TechNL posting by its link.",
      "search",
      async (link: unknown) => {
        const target = typeof link === "string" ? link : String(link ?? "");
        if (!target) return { found: false, message: "link is required" } as const;
        const result = await fetchTechNLJobsWithMatches();
        const job = result.jobs.find((j) => j.link === target);
        if (!job) {
          return {
            found: false,
            message: `No TechNL job with link "${target}". It may have been removed from the feed.`,
          } as const;
        }
        return toPlain({ found: true, job });
      },
    ),

    submitNewsLink: host(
      "submitNewsLink({ url, title?, excerpt?, sourceName? })",
      "Submit an external link as a news item (type='link'). Auto-extracts title and description from the page if not provided.",
      "creation",
      async (opts: unknown) => {
        const o = SubmitNewsLinkSchema.parse(opts ?? {});
        return submitNewsLink(o);
      },
    ),

    createNewsArticle: host(
      "createNewsArticle({ title, content, excerpt?, publish? })",
      "Create a news article directly (type='article'). publish=true marks it published immediately, else draft.",
      "creation",
      async (opts: unknown) => {
        const o = CreateNewsArticleSchema.parse(opts ?? {});
        return createNewsArticle(o);
      },
    ),

    pendingNews: host(
      "pendingNews()",
      "List news items with status='pending_review' (newly synced from RSS feeds). Returns title, externalUrl, sourceName, excerpt, publishedAt.",
      "pending",
      async () => {
        return pendingNews();
      },
    ),

    approveNews: host(
      "approveNews(id)",
      "Move a pending_review news item to published.",
      "lifecycle",
      async (id: unknown) => {
        return approveNews(Number(id));
      },
    ),

    hideNews: host(
      "hideNews(id)",
      "Hide a news item from public listings.",
      "lifecycle",
      async (id: unknown) => {
        return hideNews(Number(id));
      },
    ),
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
