import { mappedFields } from "./declarations";
import type { ColumnCoverage } from "../coverage";
export const jobsNewsCoverage: Record<string, Record<string, ColumnCoverage>> = {
  jobs: {
    ...mappedFields(
      ["jobCreate", "jobUpdate"],
      [
        "companyId",
        "title",
        "location",
        "department",
        "description",
        "url",
        "salaryRange",
        "workplaceType",
        "postedAt",
        "isTechnical",
      ],
    ),
    id: { excluded: "Generated identifier" },
    sourceId: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    sourceType: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    externalId: { excluded: "Importer identity" },
    slug: { excluded: "Derived from name or title" },
    descriptionHtml: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    descriptionText: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    externalUpdatedAt: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    firstSeenAt: { excluded: "Importer timestamp" },
    lastSeenAt: { excluded: "Importer timestamp" },
    removedAt: { mapped: { jobDeactivate: "reason" } },
    status: { mapped: { jobDeactivate: "reason" } },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  news: {
    ...mappedFields(["newsArticleCreate"], ["type"]),
    ...mappedFields(
      ["newsArticleCreate", "newsUpdate"],
      [
        "title",
        "externalUrl",
        "sourceName",
        "sourceEntityUrl",
        "content",
        "excerpt",
        "coverImage",
        "publishedAt",
        "status",
      ],
    ),
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    sourceId: { excluded: "Importer-owned source identity" },
    sourceItemId: { excluded: "Importer-owned source identity" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  job_import_sources: {
    ...mappedFields(["jobSourceCreate"], ["companyId"]),
    ...mappedFields(
      ["jobSourceCreate", "jobSourceUpdate"],
      ["sourceType", "sourceIdentifier", "sourceUrl"],
    ),
    id: { excluded: "Generated identifier" },
    lastFetchedAt: { excluded: "Sync timestamp" },
    fetchStatus: { excluded: "Sync state" },
    fetchError: { excluded: "Sync diagnostics" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  news_import_sources: {
    ...mappedFields(
      ["newsSourceCreate", "newsSourceUpdate"],
      [
        "name",
        "sourceType",
        "sourceUrl",
        "sourceIdentifier",
        "keywords",
        "useGlobalKeywords",
        "useCompanyNameFilter",
        "excerptMode",
        "entityUrl",
        "enabled",
      ],
    ),
    id: { excluded: "Generated identifier" },
    lastSyncAt: { excluded: "Maintained by sync results" },
    lastSyncStatus: { excluded: "Maintained by sync results" },
    lastSyncError: { excluded: "Maintained by sync results" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
};
