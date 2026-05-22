---
id: s-1d9c
status: closed
deps: []
links: []
created: 2026-05-22T20:28:26Z
type: task
priority: 1
assignee: Jack Arthur Harrhy
tags: [backend, discord, refactor]
---
# Discord: adopt @discordjs/rest + discord-api-types

Replace raw fetch in discord.server.ts with @discordjs/rest. Replace hand-rolled DiscordGuild/Channel/Role types with discord-api-types. Use PermissionFlagsBits constants instead of raw bigint literals. Keep computeBotChannelPermissions (still simpler than discord.js GuildMember plumbing) and the 60s in-memory cache. Get rate limit handling + retries for free.

## Acceptance Criteria

1) verifyBotToken, postMessage, listGuilds, listGuildChannels, getBotMember, getGuildRoles all go through a single REST instance with token bound. 2) PERMISSION_BITS replaced by PermissionFlagsBits where used. 3) TEXT_CHANNEL_TYPES uses ChannelType enum values. 4) All hand-rolled DiscordGuild/Channel/Role/PermissionOverwrite interfaces removed; downstream code imports types from discord-api-types/v10. 5) discord-permissions.test.ts still passes unchanged. 6) Full test suite green. 7) Build green. 8) Components v2 message posting still works (rest.post needs the flags + components wrapped correctly).

