import type { ColumnCoverage } from "../coverage";
export const administrationCoverage: Record<string, Record<string, ColumnCoverage>> = {
  rejected_records: {
    id: { mapped: { rejectedRecordRestore: "id", rejectedRecordDelete: "id" } },
    type: { excluded: "Derived from the reviewed entity" },
    entityId: { excluded: "Retained entity identity; never supplied by restore clients" },
    name: { excluded: "Copied from the stored entity for rejected-record searches" },
    wasVisible: { excluded: "Original visibility retained by rejection" },
    blockSource: { excluded: "Tracks a block created by rejection for undo" },
    blockKey: { excluded: "Canonical key of a block created by rejection for undo" },
    rejectedAt: { excluded: "Set from the operation clock" },
    expiresAt: { excluded: "Seven-day retention deadline" },
  },
  comments: {
    id: {
      excluded: "Generated identifier",
    },
    contentType: {
      excluded:
        "Public comment submission metadata; administration reads or deletes the complete record",
    },
    contentId: {
      excluded:
        "Public comment submission metadata; administration reads or deletes the complete record",
    },
    parentId: {
      excluded:
        "Public comment submission metadata; administration reads or deletes the complete record",
    },
    authorName: {
      excluded:
        "Public comment submission metadata; administration reads or deletes the complete record",
    },
    content: {
      excluded:
        "Public comment submission metadata; administration reads or deletes the complete record",
    },
    isPrivate: {
      excluded:
        "Public comment submission metadata; administration reads or deletes the complete record",
    },
    ipAddress: {
      excluded:
        "Public comment submission metadata; administration reads or deletes the complete record",
    },
    ipHash: {
      excluded:
        "Public comment submission metadata; administration reads or deletes the complete record",
    },
    userAgent: {
      excluded:
        "Public comment submission metadata; administration reads or deletes the complete record",
    },
    createdAt: {
      excluded: "Creation timestamp",
    },
  },
  site_config: {
    key: {
      mapped: {
        siteSectionVisibilitySet: "values",
        siteCommentVisibilitySet: "values",
        discordConfigSet: "botToken",
        newsGlobalKeywordsSet: "keywords",
        newsletterSettingsSet: "liveSend",
      },
    },
    value: {
      mapped: {
        siteSectionVisibilitySet: "values",
        siteCommentVisibilitySet: "values",
        discordConfigSet: "botToken",
        newsGlobalKeywordsSet: "keywords",
        newsletterSettingsSet: "liveSend",
      },
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
      mapped: {
        blocklistAdd: "source",
      },
    },
    externalId: {
      mapped: {
        blocklistAdd: "externalId",
        blocklistRemove: "externalId",
      },
    },
    name: {
      mapped: {
        blocklistAdd: "name",
        blocklistUpdate: "name",
      },
    },
    reason: {
      mapped: {
        blocklistAdd: "reason",
        blocklistUpdate: "reason",
        personDelete: "block.reason",
        companyDelete: "block.reason",
        personReject: "reason",
        companyReject: "reason",
        personBulkReject: "reason",
      },
    },
    blockedAt: {
      excluded: "Recorded when the identity is blocked",
    },
  },
  discord_destinations: {
    id: {
      excluded: "Generated identifier",
    },
    channelType: {
      mapped: {
        discordDestinationAdd: "type",
      },
    },
    guildId: {
      mapped: {
        discordDestinationAdd: "guildId",
      },
    },
    guildName: {
      mapped: {
        discordDestinationAdd: "guildName",
      },
    },
    channelId: {
      mapped: {
        discordDestinationAdd: "channelId",
      },
    },
    channelName: {
      mapped: {
        discordDestinationAdd: "channelName",
      },
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
      mapped: {
        discordPost: "type",
      },
    },
    discordMessageId: {
      excluded: "Returned by Discord or derived from the configured destination and posting clock",
    },
    discordGuildId: {
      excluded: "Returned by Discord or derived from the configured destination and posting clock",
    },
    discordChannelId: {
      excluded: "Returned by Discord or derived from the configured destination and posting clock",
    },
    batchId: {
      mapped: {
        discordUndoBatch: "batchId",
      },
    },
    introText: {
      mapped: {
        discordPost: "introText",
      },
    },
    postedAt: {
      excluded: "Returned by Discord or derived from the configured destination and posting clock",
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
      excluded:
        "Edited through the share-owner capability; administrator tools list or delete shares",
    },
    theme: {
      excluded:
        "Edited through the share-owner capability; administrator tools list or delete shares",
    },
    logo: {
      excluded:
        "Edited through the share-owner capability; administrator tools list or delete shares",
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
  import_jobs: {
    id: {
      excluded: "Fixed importer job identifier",
    },
    status: {
      excluded: "Maintained by the existing importer state machine",
    },
    totalItems: {
      excluded: "Maintained by the existing importer state machine",
    },
    processedItems: {
      excluded: "Maintained by the existing importer state machine",
    },
    currentPage: {
      excluded: "Maintained by the existing importer state machine",
    },
    totalPages: {
      excluded: "Maintained by the existing importer state machine",
    },
    rateLimitRemaining: {
      excluded: "Maintained by the existing importer state machine",
    },
    rateLimitReset: {
      excluded: "Maintained by the existing importer state machine",
    },
    lastError: {
      excluded: "Maintained by the existing importer state machine",
    },
    lastActivity: {
      excluded: "Maintained by the existing importer state machine",
    },
    importedCount: {
      excluded: "Maintained by the existing importer state machine",
    },
    skippedCount: {
      excluded: "Maintained by the existing importer state machine",
    },
    errorCount: {
      excluded: "Maintained by the existing importer state machine",
    },
    createdAt: {
      excluded: "Maintained by the existing importer state machine",
    },
  },
};
