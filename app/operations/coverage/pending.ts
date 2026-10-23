import type { ColumnCoverage } from "../coverage";
export const pendingCoverage: Record<string, Record<string, ColumnCoverage>> = {
  news_import_sources: {
    id: {
      excluded: "Generated identifier",
    },
    name: {
      gap: "news_import_sources.name",
    },
    sourceType: {
      gap: "news_import_sources.sourceType",
    },
    sourceUrl: {
      gap: "news_import_sources.sourceUrl",
    },
    sourceIdentifier: {
      gap: "news_import_sources.sourceIdentifier",
    },
    keywords: {
      gap: "news_import_sources.keywords",
    },
    useGlobalKeywords: {
      gap: "news_import_sources.useGlobalKeywords",
    },
    useCompanyNameFilter: {
      gap: "news_import_sources.useCompanyNameFilter",
    },
    excerptMode: {
      gap: "news_import_sources.excerptMode",
    },
    entityUrl: {
      gap: "news_import_sources.entityUrl",
    },
    enabled: {
      gap: "news_import_sources.enabled",
    },
    lastSyncAt: {
      gap: "news_import_sources.lastSyncAt",
    },
    lastSyncStatus: {
      gap: "news_import_sources.lastSyncStatus",
    },
    lastSyncError: {
      gap: "news_import_sources.lastSyncError",
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
      gap: "news.type",
    },
    title: {
      gap: "news.title",
    },
    externalUrl: {
      gap: "news.externalUrl",
    },
    sourceName: {
      gap: "news.sourceName",
    },
    sourceEntityUrl: {
      gap: "news.sourceEntityUrl",
    },
    content: {
      gap: "news.content",
    },
    excerpt: {
      gap: "news.excerpt",
    },
    coverImage: {
      gap: "news.coverImage",
    },
    publishedAt: {
      gap: "news.publishedAt",
    },
    status: {
      gap: "news.status",
    },
    sourceId: {
      gap: "news.sourceId",
    },
    sourceItemId: {
      gap: "news.sourceItemId",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  jobs: {
    id: {
      excluded: "Generated identifier",
    },
    companyId: {
      gap: "jobs.companyId",
    },
    sourceId: {
      gap: "jobs.sourceId",
    },
    sourceType: {
      gap: "jobs.sourceType",
    },
    externalId: {
      excluded: "Importer identity",
    },
    slug: {
      excluded: "Derived from name or title",
    },
    title: {
      gap: "jobs.title",
    },
    location: {
      gap: "jobs.location",
    },
    department: {
      gap: "jobs.department",
    },
    description: {
      gap: "jobs.description",
    },
    descriptionHtml: {
      gap: "jobs.descriptionHtml",
    },
    descriptionText: {
      gap: "jobs.descriptionText",
    },
    url: {
      gap: "jobs.url",
    },
    salaryRange: {
      gap: "jobs.salaryRange",
    },
    workplaceType: {
      gap: "jobs.workplaceType",
    },
    postedAt: {
      gap: "jobs.postedAt",
    },
    externalUpdatedAt: {
      gap: "jobs.externalUpdatedAt",
    },
    firstSeenAt: {
      excluded: "Importer timestamp",
    },
    lastSeenAt: {
      excluded: "Importer timestamp",
    },
    removedAt: {
      gap: "jobs.removedAt",
    },
    status: {
      gap: "jobs.status",
    },
    isTechnical: {
      gap: "jobs.isTechnical",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  comments: {
    id: {
      excluded: "Generated identifier",
    },
    contentType: {
      gap: "comments.contentType",
    },
    contentId: {
      gap: "comments.contentId",
    },
    parentId: {
      gap: "comments.parentId",
    },
    authorName: {
      gap: "comments.authorName",
    },
    content: {
      gap: "comments.content",
    },
    isPrivate: {
      gap: "comments.isPrivate",
    },
    ipAddress: {
      gap: "comments.ipAddress",
    },
    ipHash: {
      gap: "comments.ipHash",
    },
    userAgent: {
      gap: "comments.userAgent",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
  },
  site_config: {
    key: {
      gap: "site_config.key",
    },
    value: {
      gap: "site_config.value",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
  },
  import_blocklist: {
    id: {
      excluded: "Generated identifier",
    },
    source: {
      gap: "import_blocklist.source",
    },
    externalId: {
      excluded: "Importer identity",
    },
    name: {
      gap: "import_blocklist.name",
    },
    reason: {
      gap: "import_blocklist.reason",
    },
    blockedAt: {
      gap: "import_blocklist.blockedAt",
    },
  },
  job_import_sources: {
    id: {
      excluded: "Generated identifier",
    },
    companyId: {
      gap: "job_import_sources.companyId",
    },
    sourceType: {
      gap: "job_import_sources.sourceType",
    },
    sourceIdentifier: {
      gap: "job_import_sources.sourceIdentifier",
    },
    sourceUrl: {
      gap: "job_import_sources.sourceUrl",
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
  discord_destinations: {
    id: {
      excluded: "Generated identifier",
    },
    channelType: {
      gap: "discord_destinations.channelType",
    },
    guildId: {
      gap: "discord_destinations.guildId",
    },
    guildName: {
      gap: "discord_destinations.guildName",
    },
    channelId: {
      gap: "discord_destinations.channelId",
    },
    channelName: {
      gap: "discord_destinations.channelName",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
  },
  discord_posts: {
    id: {
      excluded: "Generated identifier",
    },
    channelType: {
      gap: "discord_posts.channelType",
    },
    discordMessageId: {
      gap: "discord_posts.discordMessageId",
    },
    discordGuildId: {
      gap: "discord_posts.discordGuildId",
    },
    discordChannelId: {
      gap: "discord_posts.discordChannelId",
    },
    batchId: {
      gap: "discord_posts.batchId",
    },
    introText: {
      gap: "discord_posts.introText",
    },
    postedAt: {
      gap: "discord_posts.postedAt",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
  },
  theme_shares: {
    id: {
      excluded: "Generated identifier",
    },
    name: {
      gap: "theme_shares.name",
    },
    theme: {
      gap: "theme_shares.theme",
    },
    logo: {
      gap: "theme_shares.logo",
    },
    logoBytes: {
      excluded: "Derived from stored logo",
    },
    editKeyHash: {
      excluded: "Private owner capability",
    },
    revision: {
      excluded: "Optimistic concurrency counter",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
    updatedAt: {
      excluded: "Mutation timestamp",
    },
    createdIp: {
      excluded: "Captured from the request",
    },
    updatedIp: {
      excluded: "Captured from the request",
    },
  },
};
