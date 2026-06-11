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
  updateEvent as updateEventRecord,
  deleteEvent as deleteEventRecord,
  getEventById as getEventByIdRecord,
  getEventBySlug as getEventBySlugRecord,
} from "~/lib/events.server";
import { getPaginatedJobs } from "~/lib/jobs.server";
import {
  getPaginatedNews,
  getNewsById,
  getNewsBySlug,
  updateNews as updateNewsRecord,
} from "~/lib/news.server";
import { getPaginatedCompanies } from "~/lib/companies.server";
import {
  getPaginatedGroups,
  createGroup as createGroupRecord,
  updateGroup as updateGroupRecord,
  deleteGroup as deleteGroupRecord,
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
  getEventImportSourceById,
  syncEvents,
  createEventImportSource,
  updateEventImportSource,
  deleteEventImportSource,
  validateEventImportSourceConfig,
  localDateTimeToUTC,
} from "~/lib/event-importers/sync.server";
import {
  getAllImportSources,
  syncJobs,
  createImportSource as createJobImportSource,
  updateImportSource as updateJobImportSource,
  deleteImportSource as deleteJobImportSource,
  getSourceById,
  getImportedJobById,
  approveJob,
  approveJobAsNonTechnical,
  hideImportedJob,
  requeueImportedJob,
} from "~/lib/job-importers/sync.server";
import { getImporter, getAllImporterMeta } from "~/lib/job-importers/index";
import type { JobSourceType } from "~/lib/job-importers/types";
import {
  createCompany as createCompanyRecord,
  getCompanyByName as getCompanyByNameRecord,
  updateCompany as updateCompanyRecord,
  deleteCompany as deleteCompanyRecord,
  getCompanyById as getCompanyByIdRecord,
  getCompanyBySlug as getCompanyBySlugRecord,
} from "~/lib/companies.server";
import {
  createJob as createJobRecord,
  updateJob as updateJobRecord,
  deleteJob as deleteJobRecord,
} from "~/lib/jobs.server";
import { searchIndeed, searchLinkedIn } from "~/lib/job-search.server";
import {
  getAllNewsImportSources,
  getNewsSourceById,
  syncNewsSource as syncNewsSourceRecord,
  createNewsImportSource,
  updateNewsImportSource,
  deleteNewsImportSource,
  approveNewsItem,
  hideNewsItem,
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

// ── Union CRUD for entities ────────────────────────────────────────────
//
// Every entity-creation/update/delete/lookup/list flows through a single
// discriminated union keyed on `type`. The discriminator overloads three
// distinct namespaces:
//   - directory entity nouns: person, education, product, project,
//     technology, company, group, event, job
//   - source kinds:            event-source, job-source, news-source
//   - news content kinds:      news-article, news-link
// All literal values are unique so the union stays unambiguous.

// ── createEntity ──────────────────────────────────────────────────────

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

const CompanyCreateSchema = z.object({
  type: z.literal("company"),
  name: z.string().min(1, "name is required"),
  website: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  email: z.string().optional(),
});

const GroupCreateSchema = z.object({
  type: z.literal("group"),
  name: z.string().min(1, "name is required"),
  description: z.string().min(1, "description is required"),
  website: z.string().optional(),
  meetingFrequency: z.string().optional(),
  visible: z.boolean().optional(),
});

const EventCreateSchema = z.object({
  type: z.literal("event"),
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
  // When true, startTime and endTime are ignored and the event renders
  // as an all-day occurrence on startDate (through endDate when set).
  isAllDay: z.boolean().optional(),
  location: z.string().optional(),
  organizer: z.string().optional(),
  requiresSignup: z.boolean().optional(),
});

const JobCreateSchema = z.object({
  type: z.literal("job"),
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

const EventSourceCreateSchema = z.object({
  type: z.literal("event-source"),
  name: z.string().min(1, "name is required"),
  sourceType: z.string().min(1, "sourceType is required"),
  sourceIdentifier: z.string().min(1, "sourceIdentifier is required"),
  sourceUrl: z.string().min(1, "sourceUrl is required"),
  organizer: z.string().optional(),
});

const JobSourceCreateSchema = z.object({
  type: z.literal("job-source"),
  companyId: z.number("companyId is required"),
  sourceType: z.string().min(1, "sourceType is required"),
  sourceIdentifier: z.string().min(1, "sourceIdentifier is required"),
  sourceUrl: z.string().optional(),
  skipValidation: z.boolean().optional(),
});

const NewsSourceCreateSchema = z.object({
  type: z.literal("news-source"),
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

const NewsArticleCreateSchema = z.object({
  type: z.literal("news-article"),
  title: z.string().min(1, "title is required"),
  content: z.string().min(1, "content is required"),
  excerpt: z.string().optional(),
  publish: z.boolean().optional(),
});

const NewsLinkCreateSchema = z.object({
  type: z.literal("news-link"),
  url: z.string().url(),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  sourceName: z.string().optional(),
});

const CreateEntitySchema = z.discriminatedUnion("type", [
  PersonCreateSchema,
  EducationCreateSchema,
  ProductCreateSchema,
  ProjectCreateSchema,
  TechnologyCreateSchema,
  CompanyCreateSchema,
  GroupCreateSchema,
  EventCreateSchema,
  JobCreateSchema,
  EventSourceCreateSchema,
  JobSourceCreateSchema,
  NewsSourceCreateSchema,
  NewsArticleCreateSchema,
  NewsLinkCreateSchema,
]);

// ── updateEntity ──────────────────────────────────────────────────────

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
  // Company update: superset of create fields (admin-only extras).
  z.object({
    type: z.literal("company"),
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
  }),
  // Job update: patches an existing job's basic fields.
  z.object({
    type: z.literal("job"),
    id: z.number("id is required"),
    title: z.string().optional(),
    description: z.string().optional(),
    url: z.string().optional(),
    location: z.string().optional(),
    department: z.string().optional(),
    workplaceType: z.enum(["remote", "onsite", "hybrid"]).optional(),
    salaryRange: z.string().optional(),
  }),
  // Job-source update.
  z.object({
    type: z.literal("job-source"),
    id: z.number("id is required"),
    sourceType: z.string().optional(),
    sourceIdentifier: z.string().optional(),
    sourceUrl: z.string().optional(),
  }),
  // Event update: patches base fields. Date editing stays on the manage
  // UI (the form bundles cropping + image + recurrence in one place).
  z.object({
    type: z.literal("event"),
    id: z.number("id is required"),
    title: z.string().optional(),
    description: z.string().optional(),
    link: z.string().optional(),
    location: z.string().optional(),
    organizer: z.string().optional(),
    requiresSignup: z.boolean().optional(),
    importStatus: z
      .enum(["pending_review", "approved", "published", "hidden", "removed"])
      .optional(),
    // Optional dates replacement. When supplied, all existing event_dates
    // rows are removed and the supplied rows are inserted in their place
    // (matching updateEvent's lib semantics). Each entry mirrors the
    // createEntity event shape.
    dates: z
      .array(
        z.object({
          startDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "dates[].startDate must be YYYY-MM-DD"),
          endDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "dates[].endDate must be YYYY-MM-DD")
            .optional(),
          startTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "dates[].startTime must be HH:mm")
            .optional(),
          endTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "dates[].endTime must be HH:mm")
            .optional(),
          isAllDay: z.boolean().optional(),
        }),
      )
      .optional(),
  }),
  // Group update.
  z.object({
    type: z.literal("group"),
    id: z.number("id is required"),
    name: z.string().optional(),
    description: z.string().optional(),
    website: z.string().optional(),
    meetingFrequency: z.string().optional(),
    visible: z.boolean().optional(),
  }),
  // News (the published item, not the source).
  z.object({
    type: z.literal("news"),
    id: z.number("id is required"),
    title: z.string().optional(),
    content: z.string().optional(),
    excerpt: z.string().optional(),
    status: z.enum(["draft", "pending_review", "published", "hidden"]).optional(),
  }),
  // Event-source update.
  z.object({
    type: z.literal("event-source"),
    id: z.number("id is required"),
    name: z.string().optional(),
    organizer: z.string().optional(),
    sourceIdentifier: z.string().optional(),
    sourceUrl: z.string().optional(),
  }),
  // News-source update — the same shape we accept for create, minus the type discriminator.
  z.object({
    type: z.literal("news-source"),
    id: z.number("id is required"),
    name: z.string().optional(),
    sourceType: z.enum(["rss", "custom"]).optional(),
    sourceUrl: z.string().optional(),
    sourceIdentifier: z.string().optional(),
    keywords: z.string().optional(),
    useGlobalKeywords: z.boolean().optional(),
    excerptMode: z.enum(["description", "content", "none"]).optional(),
    entityUrl: z.string().optional(),
    enabled: z.boolean().optional(),
  }),
]);

// ── deleteEntity ──────────────────────────────────────────────────────

const DELETABLE_ENTITY_TYPES = [
  "person",
  "education",
  "product",
  "project",
  "technology",
  "company",
  "group",
  "event",
  "job",
  "event-source",
  "job-source",
  "news-source",
] as const;

const DeleteEntitySchema = z.object({
  type: z.enum(DELETABLE_ENTITY_TYPES),
  id: z.number("id is required"),
});

// ── getEntity ─────────────────────────────────────────────────────────

const GET_ENTITY_TYPES = [
  "company",
  "group",
  "person",
  "education",
  "product",
  "project",
  "technology",
  "job",
  "news",
  "event",
  // Source types — by:id only, since they have no slug/name semantics.
  "event-source",
  "job-source",
  "news-source",
] as const;

const GetEntitySchema = z.object({
  type: z.enum(GET_ENTITY_TYPES),
  by: z.enum(["id", "slug", "name"], "by must be id|slug|name"),
  value: z.union([z.string(), z.number()]),
});

// ── listEntities ──────────────────────────────────────────────────────

const ListEntitiesSchema = z.object({
  type: z.enum([
    "job",
    "event",
    "news",
    "company",
    "group",
    "person",
    "education",
    "technology",
    // Source listings — agents previously had to call eventImportSources()
    // etc. directly; surface them via listEntities for consistency.
    "event-source",
    "job-source",
    "news-source",
  ]),
  filter: z.enum(["manual", "pending", "all"]).optional(),
});

// ── reviewEntity ──────────────────────────────────────────────────────

const ReviewEntitySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("job"),
    id: z.number("id is required"),
    action: z.enum(
      [
        "approve",
        "approve-non-technical",
        "hide",
        "requeue",
        "deactivate-removed",
        "deactivate-filled",
        "deactivate-expired",
      ],
      "action is required",
    ),
  }),
  z.object({
    type: z.literal("news"),
    id: z.number("id is required"),
    action: z.enum(["approve", "hide"], "action must be approve|hide"),
  }),
]);

// ── sync helpers ──────────────────────────────────────────────────────

const SyncSourceSchema = z.object({
  type: z.enum(["event", "job", "news"], "type must be event|job|news"),
  sourceId: z.number("sourceId is required"),
});

const SyncAllSchema = z.object({
  type: z.enum(["event", "job", "news"]).optional(),
});

// ── External search ───────────────────────────────────────────────────

const SearchJobsSchema = z.object({
  query: z.string().optional(),
  location: z.string().default("St. John's, NL"),
  limit: z.number().default(25),
  hoursOld: z.number().optional(),
});

// ── Entity schema introspection ───────────────────────────────────────
//
// Walks the discriminated-union schemas (CreateEntitySchema,
// UpdateEntitySchema, ReviewEntitySchema) and yields per-variant field
// docs. Used by server.ts to pre-render type docs into the execute
// prompt, and by search.ts to answer `search('createEntity person')`.
// Single source of truth: the zod schemas themselves. Adding a new
// variant or field updates both surfaces automatically.

export interface EntityFieldDoc {
  name: string;
  type: string;
}

export interface EntityVariantDoc {
  type: string;
  required: EntityFieldDoc[];
  optional: EntityFieldDoc[];
}

export interface UnionSchemaDoc {
  unionName: string;
  variants: EntityVariantDoc[];
}

/**
 * Resolve a zod-4 schema node down past any z.optional wrapping and
 * return both the unwrapped node and whether the outer was optional.
 */
function unwrapOptional(node: unknown): { inner: unknown; optional: boolean } {
  let cur = node as { _def?: { type?: string; innerType?: unknown } };
  let optional = false;
  // Multiple .partial() applications can produce nested optionals — keep
  // unwrapping until we hit a non-optional layer.
  while (cur?._def?.type === "optional" && cur._def.innerType) {
    optional = true;
    cur = cur._def.innerType as typeof cur;
  }
  return { inner: cur, optional };
}

/**
 * Render a zod-4 inner schema node as a human-readable type string.
 * Covers the cases we actually use in this file (literal, enum, string,
 * number, boolean, union of string|number). Falls back to "any" for
 * anything else.
 */
function renderFieldType(node: unknown): string {
  const def = (node as {
    _def?: {
      type?: string;
      values?: unknown[];
      options?: unknown[];
      entries?: Record<string, unknown>;
    };
  })?._def;
  switch (def?.type) {
    case "literal": {
      // zod 4 stores literal values as an array (single-element for the common case).
      const vs = def.values;
      if (Array.isArray(vs)) {
        return vs.length === 1 ? JSON.stringify(vs[0]) : vs.map((v) => JSON.stringify(v)).join(" | ");
      }
      return "literal";
    }
    case "enum": {
      // zod 4 stores enum entries as an object: { "a": "a", "b": "b" }.
      const entries = def.entries;
      if (entries && typeof entries === "object") {
        const keys = Object.keys(entries);
        if (keys.length > 0) return keys.join(" | ");
      }
      return "enum";
    }
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "union": {
      const opts = def.options;
      if (Array.isArray(opts)) {
        return opts.map((o) => renderFieldType(o)).join(" | ");
      }
      return "union";
    }
    default:
      return def?.type ?? "any";
  }
}

/**
 * Extract { type, required[], optional[] } from a single z.object schema.
 * The `type` field (literal discriminator) is consumed to identify the
 * variant and excluded from required/optional lists.
 */
function describeObjectSchema(schema: unknown): EntityVariantDoc | null {
  const shape = (schema as { shape?: Record<string, unknown> })?.shape;
  if (!shape) return null;

  let variantName = "?";
  const required: EntityFieldDoc[] = [];
  const optional: EntityFieldDoc[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    const { inner, optional: isOptional } = unwrapOptional(fieldSchema);
    const def = (inner as { _def?: { type?: string; values?: unknown[] } })?._def;

    if (fieldName === "type" && def?.type === "literal") {
      const vs = def.values;
      if (Array.isArray(vs) && vs.length === 1) {
        variantName = String(vs[0]);
      }
      continue;
    }

    const fieldDoc: EntityFieldDoc = { name: fieldName, type: renderFieldType(inner) };
    if (isOptional) {
      optional.push(fieldDoc);
    } else {
      required.push(fieldDoc);
    }
  }

  return { type: variantName, required, optional };
}

/**
 * Walks a discriminated-union schema and returns docs for each variant.
 * Variants are sorted in the union's declaration order so output is
 * deterministic across builds.
 */
function describeDiscriminatedUnion(unionName: string, schema: unknown): UnionSchemaDoc {
  const def = (schema as { _def?: { options?: unknown[] } })?._def;
  const opts = def?.options ?? [];
  const variants: EntityVariantDoc[] = [];
  for (const opt of opts) {
    const variant = describeObjectSchema(opt);
    if (variant) variants.push(variant);
  }
  return { unionName, variants };
}

/**
 * The canonical list of union-typed host functions and the schemas that
 * back them. Consumers (server.ts, search.ts) iterate this rather than
 * touching the schemas directly, so new unions only need to be added
 * here once.
 */
export function getEntitySchemaDocs(): UnionSchemaDoc[] {
  return [
    describeDiscriminatedUnion("createEntity", CreateEntitySchema),
    describeDiscriminatedUnion("updateEntity", UpdateEntitySchema),
    describeDiscriminatedUnion("reviewEntity", ReviewEntitySchema),
  ];
}

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
        // getPaginatedEvents returns { items, total }, matching the other
        // read host functions. Always unwrap items so callers (and the
        // listEntities filter:'all' branch) get an array.
        const { items } = await getPaginatedEvents(limit, offset);
        return toPlain(items);
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

// ── Internal helpers (used by union dispatchers) ──────────────────────

async function submitNewsLinkInternal(opts: z.infer<typeof NewsLinkCreateSchema>) {
  let { url, title, excerpt, sourceName } = opts;
  // If title not provided, fetch the page and extract metadata
  if (!title) {
    const response = await fetch(url, { headers: { "User-Agent": "siliconharbour.dev" } });
    const html = await response.text();
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    title = titleMatch ? titleMatch[1].trim() : new URL(url).hostname;
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

async function createNewsArticleInternal(opts: z.infer<typeof NewsArticleCreateSchema>) {
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

/** Execute host functions — superset of read, adds sync and pending actions */
export function buildExecuteFunctions(): HostFunctions {
  return {
    ...buildReadFunctions(),

    // ── Import-source listings ───────────────────────────────────────

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

    listImporterTypes: host(
      "listImporterTypes()",
      "Return metadata for every job importer type (greenhouse, ashby, workday, bamboohr, lever, custom, etc.) — name, approach, reliability, quirks.",
      "sources",
      async () => {
        return getAllImporterMeta();
      },
    ),

    // ── Sync ─────────────────────────────────────────────────────────

    syncSource: host(
      "syncSource({ type, sourceId }) where type is 'event'|'job'|'news'",
      "Run a sync for a single import source. Dispatches by `type` to the matching sync function.",
      "sync",
      async (opts: unknown) => {
        const o = SyncSourceSchema.parse(opts ?? {});
        switch (o.type) {
          case "event":
            return toPlain(await syncEvents(o.sourceId));
          case "job":
            return toPlain(await syncJobs(o.sourceId));
          case "news":
            return toPlain(await syncNewsSourceRecord(o.sourceId));
        }
      },
    ),

    syncAllSources: host(
      "syncAllSources({ type? }) where type is 'event'|'job'|'news' (omit to sync all)",
      "Synchronously sync all sources of the given type sequentially. If type omitted, syncs every event, job, and news source in turn.",
      "sync",
      async (opts: unknown) => {
        const o = SyncAllSchema.parse(opts ?? {});
        const results: unknown[] = [];

        if (!o.type || o.type === "event") {
          const sources = await getAllEventImportSources();
          for (const source of sources) {
            const result = await syncEvents(source.id);
            results.push({ kind: "event", sourceId: source.id, name: source.name, ...result });
          }
        }
        if (!o.type || o.type === "job") {
          const sources = await getAllImportSources();
          for (const source of sources) {
            const result = await syncJobs(source.id);
            results.push({
              kind: "job",
              sourceId: source.id,
              name: source.sourceIdentifier,
              ...result,
            });
          }
        }
        if (!o.type || o.type === "news") {
          const sources = await getAllNewsImportSources();
          for (const source of sources) {
            if (!source.enabled) continue;
            const result = await syncNewsSourceRecord(source.id);
            results.push({ kind: "news", sourceId: source.id, name: source.name, ...result });
          }
        }
        return toPlain(results);
      },
    ),

    asyncSyncAllSources: host(
      "asyncSyncAllSources({ type? }) where type is 'event'|'job'|'news' (omit to sync all)",
      "Start a background sync of all sources of the given type. If type omitted, queues every event, job, and news source in one run. Returns a runId — poll via getAsyncSync(runId).",
      "async-sync",
      async (opts: unknown) => {
        const o = SyncAllSchema.parse(opts ?? {});
        const steps: Parameters<typeof startAsyncSync>[0] = [];

        if (!o.type || o.type === "event") {
          const sources = await getAllEventImportSources();
          for (const source of sources) {
            steps.push({
              type: "event",
              sourceId: source.id,
              name: source.name,
              run: () => syncEvents(source.id),
            });
          }
        }
        if (!o.type || o.type === "job") {
          const sources = await getAllImportSources();
          for (const source of sources) {
            steps.push({
              type: "job",
              sourceId: source.id,
              name: source.sourceIdentifier,
              run: () => syncJobs(source.id),
            });
          }
        }
        if (!o.type || o.type === "news") {
          const sources = await getAllNewsImportSources();
          for (const source of sources) {
            if (!source.enabled) continue;
            steps.push({
              type: "news",
              sourceId: source.id,
              name: source.name,
              run: () => syncNewsSourceRecord(source.id),
            });
          }
        }

        return toPlain(startAsyncSync(steps));
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

    // ── Entity CRUD ──────────────────────────────────────────────────

    createEntity: host(
      "createEntity({ type, ...fields })",
      "Create an entity. `type` dispatches to the matching create flow: person, education, product, project, technology, company, group, event, job, event-source, job-source, news-source, news-article, news-link. Slug auto-generated where applicable; most entities default visible=false so an admin can review before publishing. Per-type field requirements are listed in the execute tool description; also discoverable via search('createEntity <type>').",
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
              entity: {
                id: person.id,
                name: person.name,
                slug: person.slug,
                visible: person.visible,
              },
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
          case "company": {
            const existing = await getCompanyByNameRecord(o.name.trim());
            if (existing) {
              return toPlain({
                created: false,
                type: "company",
                message: `Company "${existing.name}" already exists (id: ${existing.id})`,
                entity: { id: existing.id, name: existing.name, slug: existing.slug },
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
              type: "company",
              message: `Company "${company.name}" created (hidden, pending review)`,
              entity: { id: company.id, name: company.name, slug: company.slug },
            });
          }
          case "group": {
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
              type: "group",
              message: `Group "${group.name}" created${group.visible ? "" : " (hidden, pending review)"}. View at /manage/groups/${group.id}`,
              entity: { id: group.id, name: group.name, slug: group.slug, visible: group.visible },
            });
          }
          case "event": {
            // All manual events are anchored to America/St_Johns local time.
            // If endDate omitted, treat as same-day event. When isAllDay is
            // true the times are ignored and we anchor to noon so the
            // calendar day doesn't shift across timezones.
            const tz = "America/St_Johns";
            const isAllDay = o.isAllDay ?? false;
            const effectiveStartTime = isAllDay ? "12:00" : (o.startTime ?? null);
            const startDate = localDateTimeToUTC(o.startDate, effectiveStartTime, tz);
            const endDate =
              o.endDate || (!isAllDay && o.endTime)
                ? localDateTimeToUTC(
                    o.endDate ?? o.startDate,
                    isAllDay ? "12:00" : (o.endTime ?? o.startTime ?? null),
                    tz,
                  )
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
                // image and clicks Save & Publish at /manage/events/{id}.
                importStatus: "pending_review",
              },
              [{ startDate, endDate, isAllDay }],
            );
            return toPlain({
              created: true,
              type: "event",
              entity: {
                id: event.id,
                slug: event.slug,
                title: event.title,
                importStatus: "pending_review",
              },
              message: `Event "${o.title}" created (pending review, hidden from public). Add cover/icon images and click Save & Publish at /manage/events/${event.id}`,
            });
          }
          case "job": {
            // Resolve company by name if companyName provided instead of companyId.
            let companyId = o.companyId ?? null;
            if (!companyId && o.companyName) {
              const company = await getCompanyByNameRecord(o.companyName);
              if (company) {
                companyId = company.id;
              } else {
                return {
                  created: false,
                  type: "job",
                  message: `Company "${o.companyName}" not found. Use getEntity({ type:'company', by:'name', value:'…' }) to check, or createEntity({ type:'company', ... }) first.`,
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

            if (o.isTechnical === false) {
              await db.update(jobs).set({ isTechnical: false }).where(eq(jobs.id, job.id));
            }

            return toPlain({
              created: true,
              type: "job",
              entity: { id: job.id, slug: job.slug, title: job.title },
              message: `Job "${o.title}" created (active, manual). View at /manage/jobs/${job.id}`,
            });
          }
          case "event-source": {
            const validation = await validateEventImportSourceConfig({
              organizer: o.organizer?.trim() || null,
              sourceType: o.sourceType,
              sourceIdentifier: o.sourceIdentifier.trim(),
              sourceUrl: o.sourceUrl.trim(),
            });
            if (!validation.valid) {
              return {
                created: false,
                type: "event-source",
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
              type: "event-source",
              entity: { id: source.id, name: source.name },
              message: `Event import source "${o.name}" created (id: ${source.id}). Use syncSource({ type:'event', sourceId:${source.id} }) to run first sync.`,
              eventCount: "eventCount" in validation ? validation.eventCount : undefined,
            };
          }
          case "job-source": {
            try {
              getImporter(o.sourceType as JobSourceType);
            } catch {
              throw new Error(
                `Unsupported sourceType "${o.sourceType}". Use listImporterTypes() to see available types.`,
              );
            }

            let jobCount: number | undefined;

            if (!o.skipValidation) {
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
                  type: "job-source",
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
              type: "job-source",
              entity: { id: sourceId, sourceIdentifier: o.sourceIdentifier.trim() },
              message: `Job import source created (id: ${sourceId})${o.skipValidation ? " (validation skipped)" : ""}. Use syncSource({ type:'job', sourceId:${sourceId} }) to run first sync.`,
              jobCount,
            };
          }
          case "news-source": {
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
              type: "news-source",
              entity: { id: source.id, name: source.name, sourceType: source.sourceType },
              message: `News import source "${o.name}" created (id: ${source.id}). Use syncSource({ type:'news', sourceId:${source.id} }) to run first sync.`,
            });
          }
          case "news-article": {
            const result = await createNewsArticleInternal(o);
            return toPlain({
              created: true,
              type: "news-article",
              entity: { id: result.id, slug: result.slug, title: result.title },
            });
          }
          case "news-link": {
            const result = await submitNewsLinkInternal(o);
            return toPlain({
              created: true,
              type: "news-link",
              entity: { id: result.id, slug: result.slug, title: result.title },
            });
          }
        }
      },
    ),

    updateEntity: host(
      "updateEntity({ type, id, ...fields })",
      "Patch fields on an entity. `type` dispatches: person, education, product, project, technology, company, group, event, job, news, event-source, job-source, news-source. All fields except `type` and `id` are optional — only supplied fields are updated.",
      "creation",
      async (opts: unknown) => {
        const o = UpdateEntitySchema.parse(opts ?? {});

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
            return toPlain({
              updated: true,
              type: "person",
              message: `Person "${updated.name}" updated`,
            });
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
            return toPlain({
              updated: true,
              type: "education",
              message: `Education "${updated.name}" updated`,
            });
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
            return toPlain({
              updated: true,
              type: "product",
              message: `Product "${updated.name}" updated`,
            });
          }
          case "project": {
            const updated = await updateProjectRecord(o.id, {
              ...(o.name !== undefined && { name: o.name.trim() }),
              ...(o.description !== undefined && { description: o.description.trim() }),
              ...(o.projectType !== undefined && { type: o.projectType }),
              ...(o.status !== undefined && { status: o.status }),
            });
            if (!updated) throw new Error(`Project ${o.id} not found`);
            return toPlain({
              updated: true,
              type: "project",
              message: `Project "${updated.name}" updated`,
            });
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
            return toPlain({
              updated: true,
              type: "technology",
              message: `Technology "${updated.name}" updated`,
            });
          }
          case "company": {
            const { id, type: _t, ...fields } = o;
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
              return { updated: false, type: "company", message: "No fields to update" };
            }
            await updateCompanyRecord(id, updates);
            return toPlain({
              updated: true,
              type: "company",
              message: `Company "${existing.name}" updated (${Object.keys(updates).join(", ")})`,
            });
          }
          case "job": {
            const { id, type: _t, ...fields } = o;
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
              return { updated: false, type: "job", message: "No fields to update" };
            }
            await updateJobRecord(id, updates);
            return {
              updated: true,
              type: "job",
              message: `Job "${job.title}" updated (${Object.keys(updates).join(", ")})`,
            };
          }
          case "job-source": {
            const existing = await getSourceById(o.id);
            if (!existing) throw new Error(`Job import source ${o.id} not found`);

            if (o.sourceType) {
              try {
                getImporter(o.sourceType as JobSourceType);
              } catch {
                throw new Error(
                  `Unsupported sourceType "${o.sourceType}". Use listImporterTypes() to see available types.`,
                );
              }
            }

            const updates: {
              sourceType?: string;
              sourceIdentifier?: string;
              sourceUrl?: string | null;
            } = {};
            if (o.sourceType) updates.sourceType = o.sourceType;
            if (o.sourceIdentifier) updates.sourceIdentifier = o.sourceIdentifier.trim();
            if (o.sourceUrl !== undefined) updates.sourceUrl = o.sourceUrl?.trim() || null;

            if (Object.keys(updates).length === 0) {
              return { updated: false, type: "job-source", message: "No fields to update" };
            }
            await updateJobImportSource(o.id, updates);
            return {
              updated: true,
              type: "job-source",
              message: `Job import source ${o.id} updated (${Object.keys(updates).join(", ")})`,
            };
          }
          case "event": {
            // updateEvent matches the lib shape — Partial<Omit<NewEvent, "slug">>.
            // The dates array is converted out-of-band and passed as the
            // second argument (the lib replaces the entire event_dates set
            // when dates is non-null).
            const tz = "America/St_Johns";
            const updates: Record<string, unknown> = {};
            let parsedDates: { startDate: Date; endDate: Date | null; isAllDay: boolean }[] | undefined;
            for (const [key, value] of Object.entries(o)) {
              if (key === "type" || key === "id") continue;
              if (value === undefined) continue;
              if (key === "dates") {
                const arr = value as Array<{
                  startDate: string;
                  endDate?: string;
                  startTime?: string;
                  endTime?: string;
                  isAllDay?: boolean;
                }>;
                parsedDates = arr.map((d) => {
                  const allDay = d.isAllDay ?? false;
                  const startTime = allDay ? "12:00" : (d.startTime ?? null);
                  const startDate = localDateTimeToUTC(d.startDate, startTime, tz);
                  const endDate =
                    d.endDate || (!allDay && d.endTime)
                      ? localDateTimeToUTC(
                          d.endDate ?? d.startDate,
                          allDay ? "12:00" : (d.endTime ?? d.startTime ?? null),
                          tz,
                        )
                      : null;
                  return { startDate, endDate, isAllDay: allDay };
                });
                continue;
              }
              if (typeof value === "string") {
                updates[key] = value.trim() || null;
              } else {
                updates[key] = value;
              }
            }
            if (Object.keys(updates).length === 0 && !parsedDates) {
              return { updated: false, type: "event", message: "No fields to update" };
            }
            const updated = await updateEventRecord(o.id, updates, parsedDates);
            if (!updated) throw new Error(`Event ${o.id} not found`);
            const summary = [...Object.keys(updates), ...(parsedDates ? ["dates"] : [])].join(", ");
            return {
              updated: true,
              type: "event",
              message: `Event "${updated.title}" updated (${summary})`,
            };
          }
          case "group": {
            const updates: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(o)) {
              if (key === "type" || key === "id") continue;
              if (value === undefined) continue;
              if (typeof value === "string") {
                updates[key] = value.trim() || null;
              } else {
                updates[key] = value;
              }
            }
            if (Object.keys(updates).length === 0) {
              return { updated: false, type: "group", message: "No fields to update" };
            }
            const updated = await updateGroupRecord(o.id, updates);
            if (!updated) throw new Error(`Group ${o.id} not found`);
            return {
              updated: true,
              type: "group",
              message: `Group "${updated.name}" updated (${Object.keys(updates).join(", ")})`,
            };
          }
          case "news": {
            const updates: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(o)) {
              if (key === "type" || key === "id") continue;
              if (value === undefined) continue;
              if (typeof value === "string") {
                updates[key] = value.trim() || null;
              } else {
                updates[key] = value;
              }
            }
            if (Object.keys(updates).length === 0) {
              return { updated: false, type: "news", message: "No fields to update" };
            }
            const updated = await updateNewsRecord(o.id, updates);
            if (!updated) throw new Error(`News ${o.id} not found`);
            return {
              updated: true,
              type: "news",
              message: `News "${updated.title}" updated (${Object.keys(updates).join(", ")})`,
            };
          }
          case "event-source": {
            const updates: {
              name?: string;
              organizer?: string | null;
              sourceIdentifier?: string;
              sourceUrl?: string;
            } = {};
            if (o.name !== undefined) updates.name = o.name.trim();
            if (o.organizer !== undefined) updates.organizer = o.organizer?.trim() || null;
            if (o.sourceIdentifier !== undefined)
              updates.sourceIdentifier = o.sourceIdentifier.trim();
            if (o.sourceUrl !== undefined) updates.sourceUrl = o.sourceUrl.trim();
            if (Object.keys(updates).length === 0) {
              return { updated: false, type: "event-source", message: "No fields to update" };
            }
            await updateEventImportSource(o.id, updates);
            return {
              updated: true,
              type: "event-source",
              message: `Event import source ${o.id} updated (${Object.keys(updates).join(", ")})`,
            };
          }
          case "news-source": {
            const updates: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(o)) {
              if (key === "type" || key === "id") continue;
              if (value === undefined) continue;
              if (typeof value === "string") {
                updates[key] = value.trim() || null;
              } else {
                updates[key] = value;
              }
            }
            if (Object.keys(updates).length === 0) {
              return { updated: false, type: "news-source", message: "No fields to update" };
            }
            await updateNewsImportSource(
              o.id,
              updates as Parameters<typeof updateNewsImportSource>[1],
            );
            return {
              updated: true,
              type: "news-source",
              message: `News import source ${o.id} updated (${Object.keys(updates).join(", ")})`,
            };
          }
        }
      },
    ),

    deleteEntity: host(
      "deleteEntity({ type, id })",
      "Delete an entity by id. Types: person, education, product, project, technology, company, group, event, job, event-source, job-source, news-source. Use with care — there is no undo, and deleting an import source orphans any pending events/jobs/news that came from it.",
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
            case "company":
              return deleteCompanyRecord(o.id);
            case "group":
              return deleteGroupRecord(o.id);
            case "event":
              return deleteEventRecord(o.id);
            case "job":
              return deleteJobRecord(o.id);
            case "event-source":
              await deleteEventImportSource(o.id);
              return true;
            case "job-source":
              await deleteJobImportSource(o.id);
              return true;
            case "news-source":
              await deleteNewsImportSource(o.id);
              return true;
          }
        })();
        return { deleted: ok, type: o.type, id: o.id };
      },
    ),

    getEntity: host(
      "getEntity({ type, by, value }) where by is 'id'|'slug'|'name'",
      "Look up an entity. `by:'name'` is only supported for type:'company'. Types: company, group, person, education, product, project, technology, job, news, event, event-source, job-source, news-source. Source types support by:'id' only. Returns { found: true, type, entity } or { found: false }.",
      "lookup",
      async (opts: unknown) => {
        const o = GetEntitySchema.parse(opts ?? {});

        if (o.by === "name" && o.type !== "company") {
          return {
            found: false,
            type: o.type,
            message: `by:'name' is only supported for type:'company'. Use by:'slug' or by:'id' for ${o.type}.`,
          };
        }

        // Source types have no slug or name semantics — they're keyed
        // by numeric id only. Fail fast if the agent asks otherwise.
        if (
          (o.type === "event-source" || o.type === "job-source" || o.type === "news-source") &&
          o.by !== "id"
        ) {
          return {
            found: false,
            type: o.type,
            message: `Source types (${o.type}) only support by:'id'. Use eventImportSources()/jobImportSources()/newsImportSources() to list them.`,
          };
        }

        const value = o.value;
        const sval = typeof value === "string" ? value.trim() : String(value);
        const nval = typeof value === "number" ? value : Number(value);

        const entity = await (async () => {
          switch (o.type) {
            case "company": {
              if (o.by === "id") return getCompanyByIdRecord(nval);
              if (o.by === "slug") return getCompanyBySlugRecord(sval);
              return getCompanyByNameRecord(sval);
            }
            case "group": {
              if (o.by === "id") {
                const { getGroupById } = await import("~/lib/groups.server");
                return getGroupById(nval);
              }
              return getGroupBySlugRecord(sval);
            }
            case "person": {
              if (o.by === "id") {
                const { getPersonById } = await import("~/lib/people.server");
                return getPersonById(nval);
              }
              return getPersonBySlugRecord(sval);
            }
            case "education": {
              if (o.by === "id") {
                const { getEducationById } = await import("~/lib/education.server");
                return getEducationById(nval);
              }
              return getEducationBySlugRecord(sval);
            }
            case "product": {
              if (o.by === "id") {
                const { getProductById } = await import("~/lib/products.server");
                return getProductById(nval);
              }
              return getProductBySlugRecord(sval);
            }
            case "project": {
              if (o.by === "id") {
                const { getProjectById } = await import("~/lib/projects.server");
                return getProjectById(nval);
              }
              return getProjectBySlugRecord(sval);
            }
            case "technology": {
              if (o.by === "id") {
                const { getTechnologyById } = await import("~/lib/technologies.server");
                return getTechnologyById(nval);
              }
              return getTechnologyBySlugRecord(sval);
            }
            case "job": {
              if (o.by === "id") {
                // Mirror the old getJobDetail shape (descriptionText included).
                const job = await getImportedJobById(nval);
                if (!job) return null;
                const [company] = job.companyId
                  ? await db
                      .select({ name: companies.name })
                      .from(companies)
                      .where(eq(companies.id, job.companyId))
                      .limit(1)
                  : [];
                return {
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
                };
              }
              const { getJobBySlug } = await import("~/lib/jobs.server");
              return getJobBySlug(sval);
            }
            case "news": {
              if (o.by === "id") {
                const item = await getNewsById(nval);
                if (!item) return null;
                const source = item.sourceId ? await getNewsSourceById(item.sourceId) : null;
                return {
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
                };
              }
              return getNewsBySlug(sval);
            }
            case "event": {
              if (o.by === "id") return getEventByIdRecord(nval);
              return getEventBySlugRecord(sval);
            }
            case "event-source": {
              // by:id is enforced above; sources have no slug/name.
              return getEventImportSourceById(nval);
            }
            case "job-source": {
              return getSourceById(nval);
            }
            case "news-source": {
              return getNewsSourceById(nval);
            }
          }
        })();

        if (!entity) {
          return {
            found: false,
            type: o.type,
            message: `No ${o.type} found with ${o.by} "${value}"`,
          };
        }
        return toPlain({ found: true, type: o.type, entity });
      },
    ),

    listEntities: host(
      "listEntities({ type, filter? }) where filter is 'manual'|'pending'|'all'",
      "List entities by kind and filter. Types include the 8 directory entities (job, event, news, company, group, person, education, technology) and the 3 source types (event-source, job-source, news-source). filter:'pending' (job, event, news) returns the pending_review queue. filter:'manual' (job, event) returns manually-created entries (sourceType='manual' for jobs, no importSourceId for events). filter:'all' (the default for source types) returns the unfiltered set.",
      "lookup",
      async (opts: unknown) => {
        const o = ListEntitiesSchema.parse(opts ?? {});
        const filter = o.filter ?? "all";

        if (filter === "pending") {
          switch (o.type) {
            case "event": {
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
            }
            case "job": {
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
                    ? r.descriptionText.slice(0, 500) +
                      (r.descriptionText.length > 500 ? "..." : "")
                    : null,
                  descriptionText: undefined,
                })),
              );
            }
            case "news": {
              const { getAllPendingNews } = await import("~/lib/news-importers/sync.server");
              return toPlain(await getAllPendingNews());
            }
            default:
              throw new Error(
                `filter:'pending' is only supported for type job|event|news (got ${o.type})`,
              );
          }
        }

        if (filter === "manual") {
          switch (o.type) {
            case "job": {
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
            }
            case "event": {
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
            }
            default:
              throw new Error(`filter:'manual' is only supported for type job|event (got ${o.type})`);
          }
        }

        // filter === "all" — delegate to the read functions where possible.
        // Source types are listed directly from the source-listing helpers
        // since they aren't paginated entities.
        const read = buildReadFunctions();
        switch (o.type) {
          case "job":
            return (read.jobs as HostFn)({});
          case "event":
            return (read.events as HostFn)({});
          case "news":
            return (read.news as HostFn)({});
          case "company":
            return (read.companies as HostFn)({});
          case "group":
            return (read.groups as HostFn)({});
          case "person":
            return (read.people as HostFn)({});
          case "education":
            return (read.education as HostFn)({});
          case "technology":
            return (read.technologies as HostFn)({});
          case "event-source": {
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
          }
          case "job-source": {
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
          }
          case "news-source": {
            const sources = await getAllNewsImportSources();
            return toPlain(
              sources.map((s) => ({
                id: s.id,
                name: s.name,
                sourceType: s.sourceType,
                sourceUrl: s.sourceUrl,
                enabled: s.enabled,
                lastSyncAt: s.lastSyncAt,
                lastSyncStatus: s.lastSyncStatus,
              })),
            );
          }
        }
      },
    ),

    // ── Lifecycle / review ───────────────────────────────────────────

    reviewEntity: host(
      "reviewEntity({ type, id, action })",
      "Move a pending entity to its final state. type:'job' actions: approve | approve-non-technical | hide | requeue | deactivate-removed | deactivate-filled | deactivate-expired. type:'news' actions: approve | hide.",
      "lifecycle",
      async (opts: unknown) => {
        const o = ReviewEntitySchema.parse(opts ?? {});

        if (o.type === "job") {
          const job = await getImportedJobById(o.id);
          if (!job) throw new Error(`Job ${o.id} not found`);

          switch (o.action) {
            case "approve":
              await approveJob(o.id);
              return {
                type: "job",
                id: o.id,
                action: o.action,
                message: `"${job.title}" approved as technical`,
              };
            case "approve-non-technical":
              await approveJobAsNonTechnical(o.id);
              return {
                type: "job",
                id: o.id,
                action: o.action,
                message: `"${job.title}" approved as non-technical`,
              };
            case "hide":
              await hideImportedJob(o.id);
              return { type: "job", id: o.id, action: o.action, message: `"${job.title}" hidden` };
            case "requeue":
              await requeueImportedJob(o.id);
              return {
                type: "job",
                id: o.id,
                action: o.action,
                message: `"${job.title}" requeued for review`,
              };
            case "deactivate-removed":
            case "deactivate-filled":
            case "deactivate-expired": {
              const reason = o.action.replace(/^deactivate-/, "") as "removed" | "filled" | "expired";
              const now = new Date();
              await db
                .update(jobs)
                .set({ status: reason, removedAt: now, updatedAt: now })
                .where(eq(jobs.id, o.id));
              return {
                type: "job",
                id: o.id,
                action: o.action,
                message: `"${job.title}" marked as ${reason}`,
              };
            }
          }
        }

        // type === "news"
        switch (o.action) {
          case "approve":
            await approveNewsItem(o.id);
            return { type: "news", id: o.id, action: o.action, success: true };
          case "hide":
            await hideNewsItem(o.id);
            return { type: "news", id: o.id, action: o.action, success: true };
        }
      },
    ),

    // ── External search ──────────────────────────────────────────────

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
      "Live technl.ca job board with company-match info so you can spot which postings we already have via createEntity({ type:'job' }) or an importer.",
      "search",
      async () => {
        const result = await fetchTechNLJobsWithMatches();
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
  };
}
