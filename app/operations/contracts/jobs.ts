import { page } from "../listing";
import { listInput } from "../listing";
import { technologyProvenanceSourceKeys } from "../fields";
import { z } from "zod";
import {
  jobSourceTypes,
  jobStatuses,
  workplaceTypes,
  atsSourceTypes,
  fetchStatuses,
} from "../fields";
export const jobOutput = z
  .object({
    id: z.number(),
    companyId: z.number().nullable(),
    sourceId: z.number().nullable(),
    sourceType: z.enum(jobSourceTypes).nullable(),
    externalId: z.string().nullable(),
    slug: z.string(),
    title: z.string(),
    location: z.string().nullable(),
    department: z.string().nullable(),
    description: z.string().nullable(),
    descriptionHtml: z.string().nullable(),
    descriptionText: z.string().nullable(),
    url: z.string().nullable(),
    salaryRange: z.string().nullable(),
    workplaceType: z.enum(workplaceTypes).nullable(),
    postedAt: z.iso.datetime().nullable(),
    externalUpdatedAt: z.iso.datetime().nullable(),
    firstSeenAt: z.iso.datetime().nullable(),
    lastSeenAt: z.iso.datetime().nullable(),
    removedAt: z.iso.datetime().nullable(),
    status: z.enum(jobStatuses),
    isTechnical: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const jobListItemOutput = jobOutput
  .extend({
    companyName: z.string().nullable(),
    companyLogo: z.string().nullable(),
    importSourceType: z.string().nullable(),
    importSourceIdentifier: z.string().nullable(),
    importSourceUrl: z.string().nullable(),
  })
  .strict();
export const jobSourceOutput = z
  .object({
    id: z.number(),
    companyId: z.number(),
    sourceType: z.enum(atsSourceTypes),
    sourceIdentifier: z.string(),
    sourceUrl: z.string().nullable(),
    lastFetchedAt: z.iso.datetime().nullable(),
    fetchStatus: z.enum(fetchStatuses).nullable(),
    fetchError: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
import {
  text,
  nullableText,
  nullableUrl,
  url,
  id,
  confirm,
  updateContract,
  pagination,
} from "../fields";
export const jobFields = {
  title: text("title", 500),
  description: text("description"),
  url: url(),
  companyId: id().nullable().optional(),
  companyName: text("companyName", 300).optional(),
  location: nullableText().optional(),
  department: nullableText().optional(),
  workplaceType: z.enum(workplaceTypes).nullable().optional(),
  salaryRange: nullableText().optional(),
  isTechnical: z.boolean().optional(),
};
export const jobCreateInput = z.object(jobFields).strict();
export const jobUpdateInput = updateContract(
  z.object(jobFields).omit({ companyName: true }).partial().shape,
);
export const jobListInput = listInput(["createdAt", "postedAt", "title", "lastSeenAt"])
  .extend({
    status: z.union([z.enum(jobStatuses), z.literal("all")]).optional(),
    sourceId: id().nullable().optional(),
    companyId: id().optional(),
    isTechnical: z.boolean().optional(),
    sourceType: z.enum(jobSourceTypes).optional(),
    workplaceType: z.enum(workplaceTypes).optional(),
    location: z.string().trim().max(500).optional(),
    lastSeenAfter: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export const jobDeactivateInput = z
  .object({ id: id(), reason: z.enum(["removed", "filled", "expired"]) })
  .strict();
export const jobSourceFields = {
  companyId: id(),
  sourceType: z.enum(atsSourceTypes),
  sourceIdentifier: text("sourceIdentifier", 1000),
  sourceUrl: nullableUrl().optional(),
};
export const jobSourceCreateInput = z
  .object({ ...jobSourceFields, skipValidation: z.boolean().default(false), confirm })
  .strict();
export const jobSourceUpdateInput = updateContract(
  z.object(jobSourceFields).omit({ companyId: true }).partial().shape,
);
export const jobManualSyncInput = z
  .object({
    id: id(),
    json: text("json", 5_000_000).describe("Verafin job JSON captured in the browser."),
  })
  .strict();
export const jobTechnologyApplyInput = z
  .object({
    id: id(),
    technologyIds: z.array(id()).min(1).max(500),
    sourceKey: z.enum(technologyProvenanceSourceKeys).default("job_postings"),
    sourceUrl: nullableUrl().optional(),
    lastVerified: nullableText(20).optional(),
  })
  .strict();
export const jobSearchInput = z
  .object({
    query: z.string().max(500).optional(),
    location: text("location", 300).default("St. John's, NL"),
    limit: z.number().int().min(1).max(100).default(25),
    hoursOld: z.number().positive().optional(),
    confirm,
  })
  .strict();
export const jobSearchImportInput = z
  .object({
    title: text("title", 500),
    companyName: nullableText(300).optional(),
    location: nullableText().optional(),
    url: url(),
    description: nullableText().optional(),
    salary: nullableText().optional(),
    isRemote: z.boolean().optional(),
  })
  .strict();
export const jobSyncOutput = z
  .object({
    success: z.boolean(),
    error: z.string().optional(),
    added: z.number(),
    updated: z.number(),
    removed: z.number(),
    reactivated: z.number(),
    totalActive: z.number(),
  })
  .strict();
export const jobSyncAllOutput = z
  .object({
    success: z.boolean(),
    sourcesTotal: z.number(),
    sourcesSucceeded: z.number(),
    sourcesFailed: z.number(),
    added: z.number(),
    updated: z.number(),
    removed: z.number(),
    reactivated: z.number(),
    errors: z.array(z.string()),
    results: z.array(jobSyncOutput.extend({ sourceId: id() }).strict()),
  })
  .strict();
export const technologyPreviewOutput = z
  .object({
    jobsScanned: z.number(),
    mentionsFound: z.number(),
    uniqueTechnologies: z.number(),
    items: z.array(
      z
        .object({
          technologyId: id(),
          technologyName: z.string(),
          technologySlug: z.string(),
          category: z.string(),
          mentionCount: z.number(),
          jobCount: z.number(),
          examples: z.array(
            z
              .object({
                jobId: id(),
                jobTitle: z.string(),
                jobUrl: z.string().nullable(),
                confidence: z.number(),
                context: z.string().nullable(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export const technologyPreviewDefaults = z
  .object({ sourceKey: z.string(), sourceUrl: z.string().nullable(), lastVerified: z.string() })
  .strict();
export const technologyApplyOutput = z
  .object({
    assignedCount: z.number(),
    evidenceCreated: z.number(),
    evidenceUpdated: z.number(),
    skipped: z.number(),
  })
  .strict();
const searchMatch = z
  .object({
    companyId: z.number().nullable(),
    companySlug: z.string().nullable(),
    companyVisible: z.boolean().nullable(),
    companyConfidence: z.enum(["exact", "normalized"]).nullable(),
    existingJobId: z.number().nullable(),
    existingJobStatus: z.string().nullable(),
    duplicateConfidence: z.enum(["exact_url", "company_title"]).nullable(),
    likelyDuplicate: z.boolean(),
    companyHasJobSource: z.boolean(),
    jobSources: z.array(
      z
        .object({
          id: z.number(),
          sourceType: z.string(),
          sourceIdentifier: z.string(),
          sourceUrl: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
const discoveredSource = z
  .object({
    sourceType: z.string(),
    sourceIdentifier: z.string().nullable(),
    sourceUrl: z.string(),
    confidence: z.enum(["high", "medium"]),
  })
  .strict()
  .nullable();
const searchBase = {
  id: z.string(),
  title: z.string(),
  companyName: z.string().nullable(),
  location: z.string(),
  url: z.string(),
  datePosted: z.string().nullable(),
  salary: z.string().nullable(),
  match: searchMatch,
  discoveredSource,
};
export const indeedResultOutput = z
  .object({
    ...searchBase,
    description: z.string(),
    descriptionHtml: z.string(),
    directUrl: z.string().nullable(),
    isRemote: z.boolean(),
    attributes: z.array(z.string()),
  })
  .strict();
export const linkedInResultOutput = z
  .object({ ...searchBase, companyUrl: z.string().nullable() })
  .strict();
export const techNLJobOutput = z
  .object({
    link: z.string(),
    title: z.string(),
    company: z.string(),
    location: z.string().nullable(),
    jobType: z.string().nullable(),
    salary: z.string().nullable(),
    descriptionHtml: z.string(),
    descriptionText: z.string(),
    postedAt: z.string().nullable(),
    match: z
      .object({
        companyId: z.number().nullable(),
        companySlug: z.string().nullable(),
        companyVisible: z.boolean().nullable(),
        alreadyImported: z.boolean(),
        matchedJobId: z.number().nullable(),
        matchedJobStatus: z.string().nullable(),
        duplicateConfidence: z.enum(["exact_url", "company_title"]).nullable(),
        companyHasJobSource: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const techNLListOutput = page(techNLJobOutput).extend({ fetchedAt: z.string() }).strict();
