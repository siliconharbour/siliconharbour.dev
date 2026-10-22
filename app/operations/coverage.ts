export type ColumnCoverage =
  | { mapped: Record<string, string> }
  | { excluded: string }
  | { gap: string };

export const columnCoverage: Record<string, Record<string, ColumnCoverage>> = {
  events: {
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    title: { gap: "events.title" },
    description: { gap: "events.description" },
    location: { gap: "events.location" },
    link: { gap: "events.link" },
    organizer: { gap: "events.organizer" },
    coverImage: { gap: "events.coverImage" },
    iconImage: { gap: "events.iconImage" },
    coverImageUrl: { gap: "events.coverImageUrl" },
    requiresSignup: { gap: "events.requiresSignup" },
    timeMode: { gap: "events.timeMode" },
    parentEventId: { gap: "events.parentEventId" },
    recurrenceRule: { gap: "events.recurrenceRule" },
    recurrenceStart: { gap: "events.recurrenceStart" },
    recurrenceEnd: { gap: "events.recurrenceEnd" },
    defaultStartTime: { gap: "events.defaultStartTime" },
    defaultEndTime: { gap: "events.defaultEndTime" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
    importSourceId: { excluded: "Importer ownership" },
    externalId: { excluded: "Importer identity" },
    importStatus: { gap: "events.importStatus" },
    firstSeenAt: { excluded: "Importer timestamp" },
    lastSeenAt: { excluded: "Importer timestamp" },
  },
  event_dates: {
    id: { excluded: "Generated identifier" },
    eventId: { gap: "event_dates.eventId" },
    startDate: { gap: "event_dates.startDate" },
    endDate: { gap: "event_dates.endDate" },
    isAllDay: { gap: "event_dates.isAllDay" },
  },
  event_tags: {
    id: { excluded: "Generated identifier" },
    name: { gap: "event_tags.name" },
    slug: { excluded: "Derived from name or title" },
    color: { gap: "event_tags.color" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  event_occurrences: {
    id: { excluded: "Generated identifier" },
    eventId: { gap: "event_occurrences.eventId" },
    occurrenceDate: { gap: "event_occurrences.occurrenceDate" },
    location: { gap: "event_occurrences.location" },
    description: { gap: "event_occurrences.description" },
    link: { gap: "event_occurrences.link" },
    startTime: { gap: "event_occurrences.startTime" },
    endTime: { gap: "event_occurrences.endTime" },
    cancelled: { gap: "event_occurrences.cancelled" },
    createdAt: { excluded: "Creation timestamp" },
  },
  companies: {
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    name: {
      mapped: {
        companyCreate: "name",
        companyUpdate: "name",
      },
    },
    description: {
      mapped: {
        companyCreate: "description",
        companyUpdate: "description",
      },
    },
    website: {
      mapped: {
        companyCreate: "website",
        companyUpdate: "website",
      },
    },
    careersUrl: {
      mapped: {
        companyCreate: "careersUrl",
        companyUpdate: "careersUrl",
      },
    },
    wikipedia: {
      mapped: {
        companyCreate: "wikipedia",
        companyUpdate: "wikipedia",
      },
    },
    linkedin: {
      mapped: {
        companyCreate: "linkedin",
        companyUpdate: "linkedin",
      },
    },
    github: {
      mapped: {
        companyCreate: "github",
        companyUpdate: "github",
      },
    },
    email: {
      mapped: {
        companyCreate: "email",
        companyUpdate: "email",
      },
    },
    location: {
      mapped: {
        companyCreate: "location",
        companyUpdate: "location",
      },
    },
    founded: {
      mapped: {
        companyCreate: "founded",
        companyUpdate: "founded",
      },
    },
    logo: {
      mapped: {
        companyCreate: "logo",
        companyUpdate: "logo",
      },
    },
    coverImage: {
      mapped: {
        companyCreate: "coverImage",
        companyUpdate: "coverImage",
      },
    },
    technl: {
      mapped: {
        companyCreate: "technl",
        companyUpdate: "technl",
      },
    },
    genesis: {
      mapped: {
        companyCreate: "genesis",
        companyUpdate: "genesis",
      },
    },
    bounce: {
      mapped: {
        companyCreate: "bounce",
        companyUpdate: "bounce",
      },
    },
    newsFilterInclude: {
      mapped: {
        companyCreate: "newsFilterInclude",
        companyUpdate: "newsFilterInclude",
      },
    },
    visible: {
      mapped: {
        companyCreate: "visible",
        companyUpdate: "visible",
      },
    },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  groups: {
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    name: {
      mapped: {
        groupCreate: "name",
        groupUpdate: "name",
      },
    },
    description: {
      mapped: {
        groupCreate: "description",
        groupUpdate: "description",
      },
    },
    website: {
      mapped: {
        groupCreate: "website",
        groupUpdate: "website",
      },
    },
    meetingFrequency: {
      mapped: {
        groupCreate: "meetingFrequency",
        groupUpdate: "meetingFrequency",
      },
    },
    logo: {
      mapped: {
        groupCreate: "logo",
        groupUpdate: "logo",
      },
    },
    coverImage: {
      mapped: {
        groupCreate: "coverImage",
        groupUpdate: "coverImage",
      },
    },
    visible: {
      mapped: {
        groupCreate: "visible",
        groupUpdate: "visible",
      },
    },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  event_import_sources: {
    id: { excluded: "Generated identifier" },
    name: { gap: "event_import_sources.name" },
    organizer: { gap: "event_import_sources.organizer" },
    sourceType: { gap: "event_import_sources.sourceType" },
    sourceIdentifier: { gap: "event_import_sources.sourceIdentifier" },
    sourceUrl: { gap: "event_import_sources.sourceUrl" },
    lastFetchedAt: { excluded: "Sync timestamp" },
    fetchStatus: { excluded: "Sync state" },
    fetchError: { excluded: "Sync diagnostics" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  education: {
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    name: {
      mapped: {
        educationCreate: "name",
        educationUpdate: "name",
      },
    },
    description: {
      mapped: {
        educationCreate: "description",
        educationUpdate: "description",
      },
    },
    website: {
      mapped: {
        educationCreate: "website",
        educationUpdate: "website",
      },
    },
    type: {
      mapped: {
        educationCreate: "type",
        educationUpdate: "type",
      },
    },
    logo: {
      mapped: {
        educationCreate: "logo",
        educationUpdate: "logo",
      },
    },
    coverImage: {
      mapped: {
        educationCreate: "coverImage",
        educationUpdate: "coverImage",
      },
    },
    technl: {
      mapped: {
        educationCreate: "technl",
        educationUpdate: "technl",
      },
    },
    genesis: {
      mapped: {
        educationCreate: "genesis",
        educationUpdate: "genesis",
      },
    },
    bounce: {
      mapped: {
        educationCreate: "bounce",
        educationUpdate: "bounce",
      },
    },
    visible: {
      mapped: {
        educationCreate: "visible",
        educationUpdate: "visible",
      },
    },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  people: {
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    name: {
      mapped: {
        personCreate: "name",
        personUpdate: "name",
      },
    },
    bio: {
      mapped: {
        personCreate: "bio",
        personUpdate: "bio",
      },
    },
    website: {
      mapped: {
        personCreate: "website",
        personUpdate: "website",
      },
    },
    github: {
      mapped: {
        personCreate: "github",
        personUpdate: "github",
      },
    },
    avatar: {
      mapped: {
        personCreate: "avatar",
        personUpdate: "avatar",
      },
    },
    socialLinks: {
      mapped: {
        personCreate: "socialLinks",
        personUpdate: "socialLinks",
      },
    },
    visible: {
      mapped: {
        personCreate: "visible",
        personUpdate: "visible",
      },
    },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  news_import_sources: {
    id: { excluded: "Generated identifier" },
    name: { gap: "news_import_sources.name" },
    sourceType: { gap: "news_import_sources.sourceType" },
    sourceUrl: { gap: "news_import_sources.sourceUrl" },
    sourceIdentifier: { gap: "news_import_sources.sourceIdentifier" },
    keywords: { gap: "news_import_sources.keywords" },
    useGlobalKeywords: { gap: "news_import_sources.useGlobalKeywords" },
    useCompanyNameFilter: { gap: "news_import_sources.useCompanyNameFilter" },
    excerptMode: { gap: "news_import_sources.excerptMode" },
    entityUrl: { gap: "news_import_sources.entityUrl" },
    enabled: { gap: "news_import_sources.enabled" },
    lastSyncAt: { gap: "news_import_sources.lastSyncAt" },
    lastSyncStatus: { gap: "news_import_sources.lastSyncStatus" },
    lastSyncError: { gap: "news_import_sources.lastSyncError" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  news: {
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    type: { gap: "news.type" },
    title: { gap: "news.title" },
    externalUrl: { gap: "news.externalUrl" },
    sourceName: { gap: "news.sourceName" },
    sourceEntityUrl: { gap: "news.sourceEntityUrl" },
    content: { gap: "news.content" },
    excerpt: { gap: "news.excerpt" },
    coverImage: { gap: "news.coverImage" },
    publishedAt: { gap: "news.publishedAt" },
    status: { gap: "news.status" },
    sourceId: { gap: "news.sourceId" },
    sourceItemId: { gap: "news.sourceItemId" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  jobs: {
    id: { excluded: "Generated identifier" },
    companyId: { gap: "jobs.companyId" },
    sourceId: { gap: "jobs.sourceId" },
    sourceType: { gap: "jobs.sourceType" },
    externalId: { excluded: "Importer identity" },
    slug: { excluded: "Derived from name or title" },
    title: { gap: "jobs.title" },
    location: { gap: "jobs.location" },
    department: { gap: "jobs.department" },
    description: { gap: "jobs.description" },
    descriptionHtml: { gap: "jobs.descriptionHtml" },
    descriptionText: { gap: "jobs.descriptionText" },
    url: { gap: "jobs.url" },
    salaryRange: { gap: "jobs.salaryRange" },
    workplaceType: { gap: "jobs.workplaceType" },
    postedAt: { gap: "jobs.postedAt" },
    externalUpdatedAt: { gap: "jobs.externalUpdatedAt" },
    firstSeenAt: { excluded: "Importer timestamp" },
    lastSeenAt: { excluded: "Importer timestamp" },
    removedAt: { gap: "jobs.removedAt" },
    status: { gap: "jobs.status" },
    isTechnical: { gap: "jobs.isTechnical" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  projects: {
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    name: {
      mapped: {
        projectCreate: "name",
        projectUpdate: "name",
      },
    },
    description: {
      mapped: {
        projectCreate: "description",
        projectUpdate: "description",
      },
    },
    links: {
      mapped: {
        projectCreate: "links",
        projectUpdate: "links",
      },
    },
    type: {
      mapped: {
        projectCreate: "type",
        projectUpdate: "type",
      },
    },
    status: {
      mapped: {
        projectCreate: "status",
        projectUpdate: "status",
      },
    },
    logo: {
      mapped: {
        projectCreate: "logo",
        projectUpdate: "logo",
      },
    },
    coverImage: {
      mapped: {
        projectCreate: "coverImage",
        projectUpdate: "coverImage",
      },
    },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  project_images: {
    id: { excluded: "Generated identifier" },
    projectId: {
      mapped: {
        projectGalleryAdd: "id",
      },
    },
    image: {
      mapped: {
        projectGalleryAdd: "image",
      },
    },
    caption: {
      mapped: {
        projectGalleryAdd: "caption",
      },
    },
    sortOrder: { excluded: "Appended after the existing project gallery images" },
    createdAt: { excluded: "Creation timestamp" },
  },
  products: {
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    name: {
      mapped: {
        productCreate: "name",
        productUpdate: "name",
      },
    },
    description: {
      mapped: {
        productCreate: "description",
        productUpdate: "description",
      },
    },
    website: {
      mapped: {
        productCreate: "website",
        productUpdate: "website",
      },
    },
    companyId: {
      mapped: {
        productCreate: "companyId",
        productUpdate: "companyId",
      },
    },
    type: {
      mapped: {
        productCreate: "type",
        productUpdate: "type",
      },
    },
    logo: {
      mapped: {
        productCreate: "logo",
        productUpdate: "logo",
      },
    },
    coverImage: {
      mapped: {
        productCreate: "coverImage",
        productUpdate: "coverImage",
      },
    },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  comments: {
    id: { excluded: "Generated identifier" },
    contentType: { gap: "comments.contentType" },
    contentId: { gap: "comments.contentId" },
    parentId: { gap: "comments.parentId" },
    authorName: { gap: "comments.authorName" },
    content: { gap: "comments.content" },
    isPrivate: { gap: "comments.isPrivate" },
    ipAddress: { gap: "comments.ipAddress" },
    ipHash: { gap: "comments.ipHash" },
    userAgent: { gap: "comments.userAgent" },
    createdAt: { excluded: "Creation timestamp" },
  },
  site_config: {
    key: { gap: "site_config.key" },
    value: { gap: "site_config.value" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  import_blocklist: {
    id: { excluded: "Generated identifier" },
    source: { gap: "import_blocklist.source" },
    externalId: { excluded: "Importer identity" },
    name: { gap: "import_blocklist.name" },
    reason: { gap: "import_blocklist.reason" },
    blockedAt: { gap: "import_blocklist.blockedAt" },
  },
  technologies: {
    id: { excluded: "Generated identifier" },
    slug: { excluded: "Derived from name or title" },
    name: {
      mapped: {
        technologyCreate: "name",
        technologyUpdate: "name",
      },
    },
    category: {
      mapped: {
        technologyCreate: "category",
        technologyUpdate: "category",
      },
    },
    description: {
      mapped: {
        technologyCreate: "description",
        technologyUpdate: "description",
      },
    },
    website: {
      mapped: {
        technologyCreate: "website",
        technologyUpdate: "website",
      },
    },
    icon: {
      mapped: {
        technologyCreate: "icon",
        technologyUpdate: "icon",
      },
    },
    visible: {
      mapped: {
        technologyCreate: "visible",
        technologyUpdate: "visible",
      },
    },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  technology_assignments: {
    id: { excluded: "Generated identifier" },
    technologyId: {
      mapped: {
        companyTechnologiesSet: "technologyIds",
        companyCreate: "technologyIds",
        companyUpdate: "technologyIds",
        projectCreate: "technologyIds",
        projectUpdate: "technologyIds",
      },
    },
    contentType: { excluded: "Derived from the operation target and content type" },
    contentId: { excluded: "Derived from the operation target and content type" },
    source: {
      excluded: "Legacy importer provenance; current evidence edits use technology_evidence",
    },
    sourceUrl: {
      excluded: "Legacy importer provenance; current evidence edits use technology_evidence",
    },
    lastVerified: {
      excluded: "Legacy importer provenance; current evidence edits use technology_evidence",
    },
    createdAt: { excluded: "Creation timestamp" },
  },
  technology_evidence: {
    id: { excluded: "Generated identifier" },
    technologyAssignmentId: { excluded: "Resolved from the company technology assignment" },
    jobId: {
      mapped: {
        companyTechnologyEvidenceSet: "groups[].jobIds",
        companyCreate: "evidenceGroups[].jobIds",
        companyUpdate: "evidenceGroups[].jobIds",
      },
    },
    sourceType: {
      mapped: {
        companyTechnologyEvidenceSet: "groups[].sourceType",
        companyCreate: "evidenceGroups[].sourceType",
        companyUpdate: "evidenceGroups[].sourceType",
      },
    },
    sourceUrl: {
      mapped: {
        companyTechnologyEvidenceSet: "groups[].sourceUrl",
        companyCreate: "evidenceGroups[].sourceUrl",
        companyUpdate: "evidenceGroups[].sourceUrl",
      },
    },
    excerptText: {
      mapped: {
        companyTechnologyEvidenceSet: "groups[].excerptText",
        companyCreate: "evidenceGroups[].excerptText",
        companyUpdate: "evidenceGroups[].excerptText",
      },
    },
    lastVerified: {
      mapped: {
        companyTechnologyEvidenceSet: "groups[].lastVerified",
        companyCreate: "evidenceGroups[].lastVerified",
        companyUpdate: "evidenceGroups[].lastVerified",
      },
    },
    createdAt: { excluded: "Creation timestamp" },
  },
  job_import_sources: {
    id: { excluded: "Generated identifier" },
    companyId: { gap: "job_import_sources.companyId" },
    sourceType: { gap: "job_import_sources.sourceType" },
    sourceIdentifier: { gap: "job_import_sources.sourceIdentifier" },
    sourceUrl: { gap: "job_import_sources.sourceUrl" },
    lastFetchedAt: { excluded: "Sync timestamp" },
    fetchStatus: { excluded: "Sync state" },
    fetchError: { excluded: "Sync diagnostics" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
  },
  discord_destinations: {
    id: { excluded: "Generated identifier" },
    channelType: { gap: "discord_destinations.channelType" },
    guildId: { gap: "discord_destinations.guildId" },
    guildName: { gap: "discord_destinations.guildName" },
    channelId: { gap: "discord_destinations.channelId" },
    channelName: { gap: "discord_destinations.channelName" },
    createdAt: { excluded: "Creation timestamp" },
  },
  discord_posts: {
    id: { excluded: "Generated identifier" },
    channelType: { gap: "discord_posts.channelType" },
    discordMessageId: { gap: "discord_posts.discordMessageId" },
    discordGuildId: { gap: "discord_posts.discordGuildId" },
    discordChannelId: { gap: "discord_posts.discordChannelId" },
    batchId: { gap: "discord_posts.batchId" },
    introText: { gap: "discord_posts.introText" },
    postedAt: { gap: "discord_posts.postedAt" },
    createdAt: { excluded: "Creation timestamp" },
  },
  theme_shares: {
    id: { excluded: "Generated identifier" },
    name: { gap: "theme_shares.name" },
    theme: { gap: "theme_shares.theme" },
    logo: { gap: "theme_shares.logo" },
    logoBytes: { excluded: "Derived from stored logo" },
    editKeyHash: { excluded: "Private owner capability" },
    revision: { excluded: "Optimistic concurrency counter" },
    createdAt: { excluded: "Creation timestamp" },
    updatedAt: { excluded: "Mutation timestamp" },
    createdIp: { excluded: "Captured from the request" },
    updatedIp: { excluded: "Captured from the request" },
  },
};
