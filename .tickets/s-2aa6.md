---
id: s-2aa6
status: closed
deps: []
links: []
created: 2026-05-22T20:15:58Z
type: feature
priority: 2
assignee: Jack Arthur Harrhy
tags: [backend, frontend, discord]
---
# Discord: multi-channel destinations with server/channel picker

Replace single events/jobs channel IDs with N destinations per content type. Settings page gets a live server+channel picker (fed by GET /users/@me/guilds + GET /guilds/{id}/channels), filters to text-capable channels, disables channels where the bot lacks VIEW_CHANNEL+SEND_MESSAGES. Posting fans out to all configured destinations for the content type, recording one discord_posts row per destination tied by a batch_id so partial failures and per-channel undo work.

## Design

Schema: new discord_destinations(id, channel_type, guild_id, guild_name, channel_id, channel_name, created_at). discord_posts adds discord_guild_id and batch_id (text). Drop old discord_events_channel_id / discord_jobs_channel_id site_config keys (migrate any existing value into discord_destinations first). discord.server.ts gains listGuilds(), listGuildChannels(), getBotMember(), and a permission helper computeBotChannelPermissions(). Settings UI: per type, list current destinations with remove buttons + an Add picker (guild select -> channel select). Live fetched on loader, in-memory cache keyed by token + 60s ttl. Posting routes loop destinations and call postMessage per destination; on partial failure surface which channels failed but keep successful ones recorded.

## Acceptance Criteria

1) Settings page shows a list of events destinations and a list of jobs destinations, each with add/remove. 2) Picker only shows guilds the bot is actually in. 3) Channels list only includes text-capable types; non-postable channels appear disabled with a hover hint. 4) Adding a destination stores guild_id+name and channel_id+name. 5) Posting an events roundup with two destinations creates two discord_posts rows (same batch_id) and the message appears in both channels. 6) If posting to one channel fails, the others still succeed and the error names the failing channel. 7) Per-destination Undo deletes only that destination's row; Undo Batch is available too. 8) Old single-channel-id site_config keys are migrated into destinations and removed. 9) verifyBotToken still works and the Test Connection button additionally shows guild count.

