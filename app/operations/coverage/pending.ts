import type { ColumnCoverage } from "../coverage";
export const pendingCoverage: Record<string, Record<string, ColumnCoverage>> = {
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
