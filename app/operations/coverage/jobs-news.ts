import type { ColumnCoverage } from "../coverage";
export const jobsNewsCoverage: Record<string, Record<string, ColumnCoverage>> = {
  jobs: {
    id: {
      excluded: "Generated identifier",
    },
    companyId: {
      mapped: {
        jobCreate: "companyId",
        jobUpdate: "companyId",
      },
    },
    sourceId: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    sourceType: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    externalId: {
      excluded: "Importer identity",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    title: {
      mapped: {
        jobCreate: "title",
        jobUpdate: "title",
      },
    },
    location: {
      mapped: {
        jobCreate: "location",
        jobUpdate: "location",
      },
    },
    department: {
      mapped: {
        jobCreate: "department",
        jobUpdate: "department",
      },
    },
    description: {
      mapped: {
        jobCreate: "description",
        jobUpdate: "description",
      },
    },
    descriptionHtml: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    descriptionText: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    url: {
      mapped: {
        jobCreate: "url",
        jobUpdate: "url",
      },
    },
    salaryRange: {
      mapped: {
        jobCreate: "salaryRange",
        jobUpdate: "salaryRange",
      },
    },
    workplaceType: {
      mapped: {
        jobCreate: "workplaceType",
        jobUpdate: "workplaceType",
      },
    },
    postedAt: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    externalUpdatedAt: {
      excluded: "Importer-owned field; manual creation sets source and posting defaults",
    },
    firstSeenAt: {
      excluded: "Importer timestamp",
    },
    lastSeenAt: {
      excluded: "Importer timestamp",
    },
    removedAt: {
      mapped: {
        jobDeactivate: "reason",
      },
    },
    status: {
      mapped: {
        jobDeactivate: "reason",
      },
    },
    isTechnical: {
      mapped: {
        jobCreate: "isTechnical",
        jobUpdate: "isTechnical",
      },
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  news: {
    id: {
      excluded: "Generated identifier",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    type: {
      mapped: {
        newsArticleCreate: "type",
      },
    },
    title: {
      mapped: {
        newsArticleCreate: "title",
        newsUpdate: "title",
      },
    },
    externalUrl: {
      mapped: {
        newsArticleCreate: "externalUrl",
        newsUpdate: "externalUrl",
      },
    },
    sourceName: {
      mapped: {
        newsArticleCreate: "sourceName",
        newsUpdate: "sourceName",
      },
    },
    sourceEntityUrl: {
      mapped: {
        newsArticleCreate: "sourceEntityUrl",
        newsUpdate: "sourceEntityUrl",
      },
    },
    content: {
      mapped: {
        newsArticleCreate: "content",
        newsUpdate: "content",
      },
    },
    excerpt: {
      mapped: {
        newsArticleCreate: "excerpt",
        newsUpdate: "excerpt",
      },
    },
    coverImage: {
      mapped: {
        newsArticleCreate: "coverImage",
        newsUpdate: "coverImage",
      },
    },
    publishedAt: {
      mapped: {
        newsArticleCreate: "publishedAt",
        newsUpdate: "publishedAt",
      },
    },
    status: {
      mapped: {
        newsArticleCreate: "status",
        newsUpdate: "status",
      },
    },
    sourceId: {
      excluded: "Importer-owned source identity",
    },
    sourceItemId: {
      excluded: "Importer-owned source identity",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  job_import_sources: {
    id: {
      excluded: "Generated identifier",
    },
    companyId: {
      mapped: {
        jobSourceCreate: "companyId",
      },
    },
    sourceType: {
      mapped: {
        jobSourceCreate: "sourceType",
        jobSourceUpdate: "sourceType",
      },
    },
    sourceIdentifier: {
      mapped: {
        jobSourceCreate: "sourceIdentifier",
        jobSourceUpdate: "sourceIdentifier",
      },
    },
    sourceUrl: {
      mapped: {
        jobSourceCreate: "sourceUrl",
        jobSourceUpdate: "sourceUrl",
      },
    },
    lastFetchedAt: {
      excluded: "Sync timestamp",
    },
    fetchStatus: {
      excluded: "Sync state",
    },
    fetchError: {
      excluded: "Sync diagnostics",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  news_import_sources: {
    id: {
      excluded: "Generated identifier",
    },
    name: {
      mapped: {
        newsSourceCreate: "name",
        newsSourceUpdate: "name",
      },
    },
    sourceType: {
      mapped: {
        newsSourceCreate: "sourceType",
        newsSourceUpdate: "sourceType",
      },
    },
    sourceUrl: {
      mapped: {
        newsSourceCreate: "sourceUrl",
        newsSourceUpdate: "sourceUrl",
      },
    },
    sourceIdentifier: {
      mapped: {
        newsSourceCreate: "sourceIdentifier",
        newsSourceUpdate: "sourceIdentifier",
      },
    },
    keywords: {
      mapped: {
        newsSourceCreate: "keywords",
        newsSourceUpdate: "keywords",
      },
    },
    useGlobalKeywords: {
      mapped: {
        newsSourceCreate: "useGlobalKeywords",
        newsSourceUpdate: "useGlobalKeywords",
      },
    },
    useCompanyNameFilter: {
      mapped: {
        newsSourceCreate: "useCompanyNameFilter",
        newsSourceUpdate: "useCompanyNameFilter",
      },
    },
    excerptMode: {
      mapped: {
        newsSourceCreate: "excerptMode",
        newsSourceUpdate: "excerptMode",
      },
    },
    entityUrl: {
      mapped: {
        newsSourceCreate: "entityUrl",
        newsSourceUpdate: "entityUrl",
      },
    },
    enabled: {
      mapped: {
        newsSourceCreate: "enabled",
        newsSourceUpdate: "enabled",
      },
    },
    lastSyncAt: {
      excluded: "Maintained by sync results",
    },
    lastSyncStatus: {
      excluded: "Maintained by sync results",
    },
    lastSyncError: {
      excluded: "Maintained by sync results",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
};
