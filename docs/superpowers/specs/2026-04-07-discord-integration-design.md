# Discord Integration -- Design Spec

**Date:** 2026-04-07
**Status:** Approved, ready for implementation

---

## Overview

The website gains the ability to post curated roundup messages to Discord using a bot token and Discord's Components v2 message format. An admin composes a post from the manage area, selecting which unposted events or jobs to include, adds an optional intro blurb, previews the message, and sends it. Two separate Discord channels are supported: one for events, one for jobs. A tracking system records what has been posted (or skipped) so each compose page only surfaces new items.

---

## Goals

- Post curated event roundups and job roundups to Discord from the admin area
- Use Discord Components v2 (containers, sections, text displays, buttons) for rich formatting
- Track which events/jobs have been posted or skipped so the compose page only shows new items
- Allow skipping items to prevent noisy initial posts
- Store Discord bot configuration in the existing site settings system

## Non-Goals

- Receiving messages or slash commands from Discord (this is outbound-only)
- Scheduled/automated posting (admin manually triggers each post)
- Editing or deleting previously posted Discord messages from the admin UI
- Posting to more than two channels (events + jobs)
- discord.js or any Discord library (plain `fetch` to the REST API)

---

## Database Schema

### New table: `discord_posts`

Tracks each message sent to Discord.

```sql
CREATE TABLE `discord_posts` (
  `id`                   integer PRIMARY KEY AUTOINCREMENT,
  `channel_type`         text NOT NULL,   -- "events" | "jobs"
  `discord_message_id`   text,            -- snowflake from Discord API response (nullable if send failed)
  `discord_channel_id`   text NOT NULL,   -- snapshot of channel ID at time of posting
  `intro_text`           text,            -- optional custom intro blurb
  `posted_at`            integer NOT NULL, -- timestamp
  `created_at`           integer NOT NULL
);
```

### New table: `discord_post_items`

Junction table linking posts to the events/jobs they included (or skipped).

```sql
CREATE TABLE `discord_post_items` (
  `id`              integer PRIMARY KEY AUTOINCREMENT,
  `discord_post_id` integer NOT NULL REFERENCES `discord_posts`(`id`) ON DELETE CASCADE,
  `item_type`       text NOT NULL,    -- "event" | "job"
  `event_id`        integer REFERENCES `events`(`id`) ON DELETE SET NULL,
  `job_id`          integer REFERENCES `jobs`(`id`) ON DELETE SET NULL,
  `skipped`         integer NOT NULL DEFAULT 0  -- boolean: 1 = marked as dealt with without posting
);
```

### Indexes

- `discord_post_items(event_id)` -- for checking "has this event been dealt with?"
- `discord_post_items(job_id)` -- same for jobs
- `discord_post_items(discord_post_id)` -- for loading items in a post

### Query logic

An event is **unposted** when:

1. It has no row in `discord_post_items` where `event_id = X` (neither posted nor skipped)
2. It is publicly visible (`import_status IS NULL OR import_status = 'published'`)
3. It has an upcoming date (any row in `event_dates` with `start_date >= now`, OR a `recurrence_rule` with `recurrence_end` null or in the future)

A job is **unposted** when:

1. It has no row in `discord_post_items` where `job_id = X`
2. It has `status = 'active'`

---

## Settings

Three new keys in the `site_config` key-value table, following the existing pattern:

| Key                         | Type | Description                                                                          |
| --------------------------- | ---- | ------------------------------------------------------------------------------------ |
| `discord_bot_token`         | text | Discord bot token (stored as plaintext in the DB, displayed as password input in UI) |
| `discord_events_channel_id` | text | Discord channel snowflake for event posts                                            |
| `discord_jobs_channel_id`   | text | Discord channel snowflake for job posts                                              |

### Settings page changes

A new "Discord" card section is added to `/manage/settings`, below the existing Comments section. It contains:

- **Bot Token** -- password-type `<input>` with a "Test Connection" button that calls a server action to verify the token via Discord's `GET /users/@me` endpoint. Shows green/red inline status.
- **Events Channel ID** -- text input
- **Jobs Channel ID** -- text input

These three fields are saved alongside the existing section/comment visibility settings in the same form submission. New helper functions in `config.server.ts`:

- `getDiscordConfig()` -- returns `{ botToken, eventsChannelId, jobsChannelId }` (all strings, empty if not set)
- `updateDiscordConfig(config)` -- upserts the three keys

---

## Admin Pages

### Routes

Two new routes registered in `app/routes.ts` under the `manage` prefix:

```ts
...prefix("discord", [
  route("events", "routes/manage/discord/events.tsx"),
  route("jobs", "routes/manage/discord/jobs.tsx"),
]),
```

A link to each is added to the manage dashboard (`/manage`) in a new "Discord" tools section, following the same card pattern used by Import Tools.

### `/manage/discord/events` -- Compose Events Post

**Loader:**

1. Require auth
2. Load Discord config (bot token + events channel ID) -- if not configured, show a message linking to settings
3. Query unposted upcoming events (LEFT JOIN against `discord_post_items`, filter for null)
4. Load recent post history (last 10 `discord_posts` where `channel_type = 'events'`, with their items)

**UI sections:**

1. **Unposted events list** -- each event shown as a row with:
   - Checkbox (checked by default) to include in the post
   - Event title, next date, location
   - A "Skip" button per row (submits a form action that creates a `discord_post_items` row with `skipped = 1` and no `discord_post_id` -- see note below)
2. **Intro text** -- textarea for optional custom intro (e.g., "Here's what's coming up this week!")
3. **Preview** -- a styled approximation of the Discord message rendered in HTML, using the harbour design system (not a pixel-perfect Discord replica, just a reasonable preview showing the structure: intro, then each event with title/date/location and a "More Info" link)
4. **Post button** -- disabled if no events are selected or channel is not configured

**Actions (form intents):**

- `intent=skip` + `eventId` -- creates a `discord_post_items` row with `skipped=1`, `discord_post_id` pointing to a special "skip" post entry (a `discord_posts` row with `channel_type='events'`, `discord_message_id=NULL`, `discord_channel_id` from config). This keeps the schema clean -- every item always belongs to a post record.
- `intent=post` + selected event IDs + intro text -- calls Discord API, creates `discord_posts` + `discord_post_items` rows
- `intent=test` -- verifies bot token (used from settings, but could be reused here)

### `/manage/discord/jobs` -- Compose Jobs Post

Identical structure to the events page, but for jobs:

- Shows unposted active jobs instead of events
- Each job row shows: title, company name, location, workplace type
- Posts to the jobs channel ID
- Same skip/post mechanics

### Skip mechanic detail

When an item is skipped, we create a `discord_posts` row as a "skip batch" (no Discord message ID, acts as a grouping record) and attach the skipped item to it. This means:

- The `discord_post_items` table always has a valid `discord_post_id` foreign key
- Skip history is visible in the recent posts list (shown as "Skipped 3 events" or similar)
- The unposted query remains a simple LEFT JOIN check

---

## Discord Message Format

Uses Components v2 (`flags: 1 << 15`, i.e., `32768`). The accent color is `0x2B51D1` (harbour-600).

### Events Message Structure

```json
{
  "flags": 32768,
  "components": [
    {
      "type": 17,
      "color": 2838993,
      "components": [
        // Intro text (if provided)
        { "type": 10, "content": "**intro text here**" },
        { "type": 14, "spacing": 1 },

        // Per event (repeated, with separator between):
        {
          "type": 9,
          "components": [
            {
              "type": 10,
              "content": "**Event Title**\nTue, Apr 15 at 7:00 PM \u2022 The Rocket Room\nFirst ~100 chars of description..."
            }
          ],
          "accessory": {
            "type": 11,
            "media": { "url": "https://siliconharbour.dev/images/event-cover.jpg" }
          }
        },
        {
          "type": 1,
          "components": [
            {
              "type": 2,
              "style": 5,
              "label": "More Info",
              "url": "https://siliconharbour.dev/events/event-slug"
            }
          ]
        },
        { "type": 14, "spacing": 1 }
      ]
    }
  ]
}
```

If the event has no cover image, omit the `accessory` thumbnail from the section (use a plain `TextDisplay` component outside of a Section instead).

### Jobs Message Structure

Same container pattern, but jobs typically have no image:

```json
{
  "flags": 32768,
  "components": [
    {
      "type": 17,
      "color": 2838993,
      "components": [
        // Intro text (if provided)
        { "type": 10, "content": "**intro text here**" },
        { "type": 14, "spacing": 1 },

        // Per job (repeated, with separator between):
        {
          "type": 10,
          "content": "**Senior Developer**\nCoLab Software \u2022 St. John's \u2022 Hybrid"
        },
        {
          "type": 1,
          "components": [
            {
              "type": 2,
              "style": 5,
              "label": "View Job",
              "url": "https://siliconharbour.dev/jobs/senior-developer-colab"
            }
          ]
        },
        { "type": 14, "spacing": 1 }
      ]
    }
  ]
}
```

### Limits

- Discord allows up to 40 components per message. Each event/job consumes ~3-4 components (text + action row + separator). This means roughly 10-12 items per message before hitting the limit.
- If there are more unposted items than can fit, the admin should post in batches (the UI doesn't need to enforce this initially -- just document the ~10 item practical limit).

---

## Server-Side Discord Module

**File:** `app/lib/discord.server.ts`

Plain `fetch()` calls to the Discord REST API v10 (`https://discord.com/api/v10`).

### Functions

| Function                                                         | Purpose                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `verifyBotToken(token: string)`                                  | `GET /users/@me` -- returns `{ valid: boolean, username?: string }`                          |
| `postMessage(channelId: string, payload: object, token: string)` | `POST /channels/{id}/messages` -- returns `{ id: string }` (the message snowflake) or throws |
| `buildEventsMessage(events: Event[], introText?: string)`        | Assembles the Components v2 JSON for an events roundup                                       |
| `buildJobsMessage(jobs: Job[], introText?: string)`              | Assembles the Components v2 JSON for a jobs roundup                                          |

### Error handling

- If the bot token is invalid or missing, the compose page shows a configuration warning
- If `postMessage` fails (network error, permissions, rate limit), the action returns an error and no `discord_posts` row is created
- The admin can retry by submitting again (the events/jobs are still unposted since no rows were written)

### Auth headers

All Discord API calls use:

```
Authorization: Bot {token}
Content-Type: application/json
```

---

## File Inventory

| File                                   | Purpose                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `drizzle/0043_add_discord_posts.sql`   | Migration: create `discord_posts` and `discord_post_items` tables                         |
| `app/db/schema.ts`                     | Add `discordPosts` and `discordPostItems` table definitions                               |
| `app/lib/config.server.ts`             | Add `getDiscordConfig()` and `updateDiscordConfig()`                                      |
| `app/lib/discord.server.ts`            | New: Discord API client + message builders                                                |
| `app/lib/discord-posts.server.ts`      | New: DB operations for discord posts (create post, skip items, get unposted, get history) |
| `app/routes/manage/settings.tsx`       | Add Discord settings section                                                              |
| `app/routes/manage/discord/events.tsx` | New: compose & post events to Discord                                                     |
| `app/routes/manage/discord/jobs.tsx`   | New: compose & post jobs to Discord                                                       |
| `app/routes/manage/index.tsx`          | Add Discord links to dashboard                                                            |
| `app/routes.ts`                        | Register new discord routes                                                               |
