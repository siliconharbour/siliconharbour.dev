# Discord Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add outbound Discord posting from the admin area for curated event and job roundups using Components v2.

**Architecture:** The website calls Discord's REST API v10 directly using `fetch()` with a bot token. Discord settings (bot token, channel IDs) live in the existing `site_config` key-value table. Two new admin pages compose and post messages. A `discord_posts` + `discord_post_items` tracking system knows what's been posted or skipped.

**Tech Stack:** React Router v7, Drizzle ORM (SQLite), Discord REST API v10, Components v2 (flag `1 << 15`)

---

## File Map

| File                                   | Action | Responsibility                                                                |
| -------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `drizzle/0043_add_discord_posts.sql`   | Create | Migration SQL for `discord_posts` and `discord_post_items` tables             |
| `drizzle/meta/_journal.json`           | Modify | Register migration entry                                                      |
| `app/db/schema.ts`                     | Modify | Drizzle table definitions for `discord_posts` and `discord_post_items`        |
| `app/lib/config.server.ts`             | Modify | Add `getDiscordConfig()` and `updateDiscordConfig()`                          |
| `app/lib/discord.server.ts`            | Create | Discord REST API client: verify token, post message                           |
| `app/lib/discord-messages.server.ts`   | Create | Build Components v2 payloads for events and jobs                              |
| `app/lib/discord-posts.server.ts`      | Create | DB operations: create post, skip items, get unposted events/jobs, get history |
| `app/routes/manage/settings.tsx`       | Modify | Add Discord config section (bot token, channel IDs, test connection)          |
| `app/routes/manage/discord/events.tsx` | Create | Compose & post events to Discord                                              |
| `app/routes/manage/discord/jobs.tsx`   | Create | Compose & post jobs to Discord                                                |
| `app/routes/manage/index.tsx`          | Modify | Add Discord links to dashboard                                                |
| `app/routes.ts`                        | Modify | Register discord routes                                                       |

---

### Task 1: Database Migration and Schema

**Files:**

- Create: `drizzle/0043_add_discord_posts.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `app/db/schema.ts`

- [ ] **Step 1: Create the migration SQL file**

Create `drizzle/0043_add_discord_posts.sql`:

```sql
CREATE TABLE `discord_posts` (
  `id`                   integer PRIMARY KEY AUTOINCREMENT,
  `channel_type`         text NOT NULL,
  `discord_message_id`   text,
  `discord_channel_id`   text NOT NULL,
  `intro_text`           text,
  `posted_at`            integer NOT NULL,
  `created_at`           integer NOT NULL
);

CREATE TABLE `discord_post_items` (
  `id`              integer PRIMARY KEY AUTOINCREMENT,
  `discord_post_id` integer NOT NULL REFERENCES `discord_posts`(`id`) ON DELETE CASCADE,
  `item_type`       text NOT NULL,
  `event_id`        integer REFERENCES `events`(`id`) ON DELETE SET NULL,
  `job_id`          integer REFERENCES `jobs`(`id`) ON DELETE SET NULL,
  `skipped`         integer NOT NULL DEFAULT 0
);

CREATE INDEX `discord_post_items_event_id_idx` ON `discord_post_items`(`event_id`);
CREATE INDEX `discord_post_items_job_id_idx` ON `discord_post_items`(`job_id`);
CREATE INDEX `discord_post_items_discord_post_id_idx` ON `discord_post_items`(`discord_post_id`);
```

- [ ] **Step 2: Register migration in journal**

Add entry to `drizzle/meta/_journal.json` in the `entries` array, after the last entry (idx 42):

```json
{
  "idx": 43,
  "version": "6",
  "when": 1768728000000,
  "tag": "0043_add_discord_posts",
  "breakpoints": true
}
```

- [ ] **Step 3: Add Drizzle table definitions**

Add to `app/db/schema.ts` after the existing table definitions (near the end of the file, before any exports of arrays/types):

```typescript
// Discord integration
export const discordChannelTypes = ["events", "jobs"] as const;
export type DiscordChannelType = (typeof discordChannelTypes)[number];

export const discordPostItemTypes = ["event", "job"] as const;
export type DiscordPostItemType = (typeof discordPostItemTypes)[number];

export const discordPosts = sqliteTable("discord_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelType: text("channel_type", { enum: discordChannelTypes }).notNull(),
  discordMessageId: text("discord_message_id"),
  discordChannelId: text("discord_channel_id").notNull(),
  introText: text("intro_text"),
  postedAt: integer("posted_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const discordPostItems = sqliteTable(
  "discord_post_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    discordPostId: integer("discord_post_id")
      .notNull()
      .references(() => discordPosts.id, { onDelete: "cascade" }),
    itemType: text("item_type", { enum: discordPostItemTypes }).notNull(),
    eventId: integer("event_id").references(() => events.id, {
      onDelete: "set null",
    }),
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    skipped: integer("skipped", { mode: "boolean" }).notNull().default(false),
  },
  (table) => ({
    eventIdIdx: index("discord_post_items_event_id_idx").on(table.eventId),
    jobIdIdx: index("discord_post_items_job_id_idx").on(table.jobId),
    discordPostIdIdx: index("discord_post_items_discord_post_id_idx").on(table.discordPostId),
  }),
);

export type DiscordPost = typeof discordPosts.$inferSelect;
export type NewDiscordPost = typeof discordPosts.$inferInsert;
export type DiscordPostItem = typeof discordPostItems.$inferSelect;
export type NewDiscordPostItem = typeof discordPostItems.$inferInsert;
```

- [ ] **Step 4: Run migration**

```bash
pnpm run db:migrate
```

- [ ] **Step 5: Commit**

```bash
git add drizzle/0043_add_discord_posts.sql drizzle/meta/_journal.json app/db/schema.ts
git commit -m "Add discord_posts and discord_post_items tables"
```

---

### Task 2: Discord Config in Settings

**Files:**

- Modify: `app/lib/config.server.ts`
- Modify: `app/routes/manage/settings.tsx`

- [ ] **Step 1: Add Discord config helpers to `app/lib/config.server.ts`**

Append to the end of the file:

```typescript
// =============================================================================
// Discord configuration
// =============================================================================

const DISCORD_PREFIX = "discord_";

export interface DiscordConfig {
  botToken: string;
  eventsChannelId: string;
  jobsChannelId: string;
}

const discordConfigKeys = ["bot_token", "events_channel_id", "jobs_channel_id"] as const;

/**
 * Get Discord configuration
 */
export async function getDiscordConfig(): Promise<DiscordConfig> {
  const results = await db.select().from(siteConfig).all();
  const configMap = new Map(results.map((r) => [r.key, r.value]));

  return {
    botToken: configMap.get(`${DISCORD_PREFIX}bot_token`) ?? "",
    eventsChannelId: configMap.get(`${DISCORD_PREFIX}events_channel_id`) ?? "",
    jobsChannelId: configMap.get(`${DISCORD_PREFIX}jobs_channel_id`) ?? "",
  };
}

/**
 * Update Discord configuration
 */
export async function updateDiscordConfig(config: Partial<DiscordConfig>): Promise<void> {
  const keyMap: Record<string, string> = {
    botToken: "bot_token",
    eventsChannelId: "events_channel_id",
    jobsChannelId: "jobs_channel_id",
  };

  for (const [prop, value] of Object.entries(config)) {
    const dbKey = keyMap[prop];
    if (!dbKey) continue;
    const key = `${DISCORD_PREFIX}${dbKey}`;
    await db
      .insert(siteConfig)
      .values({ key, value: value as string })
      .onConflictDoUpdate({
        target: siteConfig.key,
        set: { value: value as string, updatedAt: new Date() },
      });
  }
}
```

- [ ] **Step 2: Update the settings page loader**

In `app/routes/manage/settings.tsx`, add `getDiscordConfig` to the imports from `~/lib/config.server` and update the loader:

```typescript
import {
  getSectionVisibility,
  updateSectionVisibility,
  getCommentVisibility,
  updateCommentVisibility,
  getDiscordConfig,
  updateDiscordConfig,
  type SectionVisibility,
  type CommentVisibility,
} from "~/lib/config.server";
```

Update the loader to fetch Discord config:

```typescript
export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [visibility, commentVisibility, discordConfig] = await Promise.all([
    getSectionVisibility(),
    getCommentVisibility(),
    getDiscordConfig(),
  ]);
  return { visibility, commentVisibility, discordConfig };
}
```

- [ ] **Step 3: Update the settings page action**

Add Discord config handling to the action. After the existing `commentUpdates` logic, add:

```typescript
const discordUpdates: Partial<{
  botToken: string;
  eventsChannelId: string;
  jobsChannelId: string;
}> = {};
const botToken = formData.get("discord_bot_token");
const eventsChannelId = formData.get("discord_events_channel_id");
const jobsChannelId = formData.get("discord_jobs_channel_id");
if (typeof botToken === "string") discordUpdates.botToken = botToken;
if (typeof eventsChannelId === "string") discordUpdates.eventsChannelId = eventsChannelId;
if (typeof jobsChannelId === "string") discordUpdates.jobsChannelId = jobsChannelId;
```

Add `updateDiscordConfig(discordUpdates)` to the `Promise.all` call:

```typescript
await Promise.all([
  updateSectionVisibility(sectionUpdates),
  updateCommentVisibility(commentUpdates),
  updateDiscordConfig(discordUpdates),
]);
```

For the "Test Connection" intent, add at the top of the action before the existing logic:

```typescript
const intent = formData.get("intent");
if (intent === "test-discord") {
  const token = formData.get("discord_bot_token");
  if (!token || typeof token !== "string") {
    return { success: false, discordTest: { valid: false, error: "No token provided" } };
  }
  const { verifyBotToken } = await import("~/lib/discord.server");
  const result = await verifyBotToken(token);
  return { success: false, discordTest: result };
}
```

- [ ] **Step 4: Add Discord section to the settings UI**

After the Comments card section and before the Save button, add a Discord section. Also update the component to read `discordConfig` from loader data and `discordTest` from action data. The new section uses a separate `<Form>` for the test button (so it doesn't save all settings), while the inputs are inside the main `<Form>`:

```tsx
<div className="bg-white border border-harbour-200 p-6">
  <h2 className="text-lg font-semibold text-harbour-700 mb-4">Discord</h2>
  <p className="text-sm text-harbour-400 mb-6">
    Configure the Discord bot for posting event and job roundups to your server.
  </p>

  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <label htmlFor="discord_bot_token" className="font-medium text-harbour-700 text-sm">
        Bot Token
      </label>
      <div className="flex gap-2">
        <input
          type="password"
          id="discord_bot_token"
          name="discord_bot_token"
          defaultValue={discordConfig.botToken}
          placeholder="Enter Discord bot token"
          className="flex-1 px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
        />
      </div>
    </div>

    <div className="flex flex-col gap-1">
      <label htmlFor="discord_events_channel_id" className="font-medium text-harbour-700 text-sm">
        Events Channel ID
      </label>
      <input
        type="text"
        id="discord_events_channel_id"
        name="discord_events_channel_id"
        defaultValue={discordConfig.eventsChannelId}
        placeholder="e.g., 1234567890123456789"
        className="px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
      />
    </div>

    <div className="flex flex-col gap-1">
      <label htmlFor="discord_jobs_channel_id" className="font-medium text-harbour-700 text-sm">
        Jobs Channel ID
      </label>
      <input
        type="text"
        id="discord_jobs_channel_id"
        name="discord_jobs_channel_id"
        defaultValue={discordConfig.jobsChannelId}
        placeholder="e.g., 1234567890123456789"
        className="px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
      />
    </div>
  </div>
</div>
```

The test connection button should be a separate `<Form>` placed inside the Discord card (it submits `intent=test-discord` plus the current token value via a hidden input populated by JavaScript or by reading the input value). A simpler approach: use `useFetcher()` for the test button so it doesn't navigate:

```tsx
const testFetcher = useFetcher();
const discordTestResult = testFetcher.data?.discordTest;
```

Inside the bot token field area, after the input:

```tsx
<button
  type="button"
  onClick={() => {
    const tokenInput = document.getElementById("discord_bot_token") as HTMLInputElement;
    const formData = new FormData();
    formData.set("intent", "test-discord");
    formData.set("discord_bot_token", tokenInput?.value ?? "");
    testFetcher.submit(formData, { method: "post" });
  }}
  className="px-3 py-2 text-sm border border-harbour-200 text-harbour-600 hover:bg-harbour-50 transition-colors whitespace-nowrap"
>
  {testFetcher.state === "submitting" ? "Testing..." : "Test Connection"}
</button>
```

Below the bot token row, show the test result:

```tsx
{
  discordTestResult && (
    <p className={`text-sm ${discordTestResult.valid ? "text-green-700" : "text-red-700"}`}>
      {discordTestResult.valid
        ? `Connected as ${discordTestResult.username}`
        : `Connection failed: ${discordTestResult.error || "Invalid token"}`}
    </p>
  );
}
```

Add `useFetcher` to the react-router imports.

- [ ] **Step 5: Commit**

```bash
git add app/lib/config.server.ts app/routes/manage/settings.tsx
git commit -m "Add Discord configuration to site settings

- Bot token, events channel ID, jobs channel ID in site_config
- Test connection button verifies token against Discord API
- Settings saved alongside existing visibility config"
```

---

### Task 3: Discord API Client

**Files:**

- Create: `app/lib/discord.server.ts`

- [ ] **Step 1: Create the Discord API client**

Create `app/lib/discord.server.ts`:

```typescript
const DISCORD_API_BASE = "https://discord.com/api/v10";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
}

export interface VerifyResult {
  valid: boolean;
  username?: string;
  error?: string;
}

/**
 * Verify a Discord bot token by calling GET /users/@me
 */
export async function verifyBotToken(token: string): Promise<VerifyResult> {
  try {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!response.ok) {
      return { valid: false, error: `HTTP ${response.status}` };
    }

    const user: DiscordUser = await response.json();
    return { valid: true, username: user.username };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export interface PostMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Post a Components v2 message to a Discord channel.
 *
 * The payload should be the `components` array. This function wraps it
 * with the IS_COMPONENTS_V2 flag (1 << 15 = 32768).
 */
export async function postMessage(
  channelId: string,
  components: object[],
  token: string,
): Promise<PostMessageResult> {
  try {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        flags: 1 << 15,
        components,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: `Discord API error ${response.status}: ${errorBody}`,
      };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/discord.server.ts
git commit -m "Add Discord REST API client

- verifyBotToken: validates token via GET /users/@me
- postMessage: sends Components v2 messages to channels"
```

---

### Task 4: Discord Message Builders

**Files:**

- Create: `app/lib/discord-messages.server.ts`

- [ ] **Step 1: Create the message builder module**

Create `app/lib/discord-messages.server.ts`. This module builds the Components v2 JSON payloads.

```typescript
import { format } from "date-fns";
import type { EventWithDates } from "~/lib/events.server";

const SITE_URL = process.env.SITE_URL || "https://siliconharbour.dev";
const ACCENT_COLOR = 0x2b51d1; // harbour-600

interface JobForDiscord {
  slug: string;
  title: string;
  location: string | null;
  workplaceType: string | null;
  companyName: string | null;
}

/**
 * Build Components v2 payload for an events roundup message.
 */
export function buildEventsMessage(events: EventWithDates[], introText?: string): object[] {
  const innerComponents: object[] = [];

  // Intro text
  if (introText?.trim()) {
    innerComponents.push({ type: 10, content: introText.trim() });
    innerComponents.push({ type: 14, spacing: 1 });
  }

  events.forEach((event, index) => {
    const nextDate = event.dates[0];
    const dateLine = nextDate ? format(nextDate.startDate, "EEE, MMM d 'at' h:mm a") : "Date TBD";
    const parts = [dateLine];
    if (event.location) parts.push(event.location);
    const subtitle = parts.join(" \u2022 ");

    // Truncate description to ~150 chars for the preview
    const desc = (event.description || "").replace(/[#*_~`>\[\]]/g, "").trim();
    const shortDesc = desc.length > 150 ? desc.slice(0, 147) + "..." : desc;
    const textContent = `**${event.title}**\n${subtitle}${shortDesc ? `\n${shortDesc}` : ""}`;

    const eventUrl = `${SITE_URL}/events/${event.slug}`;

    // Use Section with thumbnail if cover image exists, otherwise plain TextDisplay
    const hasCover = event.coverImage || event.coverImageUrl;
    if (hasCover) {
      const imageUrl = event.coverImageUrl || `${SITE_URL}/images/${event.coverImage}`;
      innerComponents.push({
        type: 9,
        components: [{ type: 10, content: textContent }],
        accessory: {
          type: 11,
          media: { url: imageUrl },
        },
      });
    } else {
      innerComponents.push({ type: 10, content: textContent });
    }

    // Link button
    innerComponents.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: "More Info",
          url: eventUrl,
        },
      ],
    });

    // Separator between events (not after the last one)
    if (index < events.length - 1) {
      innerComponents.push({ type: 14, spacing: 1 });
    }
  });

  // Wrap in a Container with accent color
  return [
    {
      type: 17,
      color: ACCENT_COLOR,
      components: innerComponents,
    },
  ];
}

/**
 * Build Components v2 payload for a jobs roundup message.
 */
export function buildJobsMessage(jobs: JobForDiscord[], introText?: string): object[] {
  const innerComponents: object[] = [];

  // Intro text
  if (introText?.trim()) {
    innerComponents.push({ type: 10, content: introText.trim() });
    innerComponents.push({ type: 14, spacing: 1 });
  }

  jobs.forEach((job, index) => {
    const parts: string[] = [];
    if (job.companyName) parts.push(job.companyName);
    if (job.location) parts.push(job.location);
    if (job.workplaceType) {
      parts.push(job.workplaceType.charAt(0).toUpperCase() + job.workplaceType.slice(1));
    }
    const subtitle = parts.join(" \u2022 ");
    const textContent = `**${job.title}**${subtitle ? `\n${subtitle}` : ""}`;

    const jobUrl = `${SITE_URL}/jobs/${job.slug}`;

    innerComponents.push({ type: 10, content: textContent });

    // Link button
    innerComponents.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: "View Job",
          url: jobUrl,
        },
      ],
    });

    // Separator between jobs (not after the last one)
    if (index < jobs.length - 1) {
      innerComponents.push({ type: 14, spacing: 1 });
    }
  });

  // Wrap in a Container with accent color
  return [
    {
      type: 17,
      color: ACCENT_COLOR,
      components: innerComponents,
    },
  ];
}
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/discord-messages.server.ts
git commit -m "Add Discord Components v2 message builders

- buildEventsMessage: container with sections, thumbnails, link buttons
- buildJobsMessage: container with text displays and link buttons
- Uses harbour-600 accent color"
```

---

### Task 5: Discord Posts Database Operations

**Files:**

- Create: `app/lib/discord-posts.server.ts`

- [ ] **Step 1: Create the discord posts DB module**

Create `app/lib/discord-posts.server.ts`:

```typescript
import { db } from "~/db";
import {
  discordPosts,
  discordPostItems,
  events,
  eventDates,
  jobs,
  companies,
  type DiscordChannelType,
} from "~/db/schema";
import { eq, and, isNull, gte, or, sql, desc } from "drizzle-orm";

// ============================================================================
// Unposted queries
// ============================================================================

/**
 * Get upcoming events that have not been posted or skipped to Discord.
 * An event is "upcoming" if it has a future date in event_dates, or has a
 * recurrence_rule with no end (or end in the future).
 * An event is "dealt with" if any row exists in discord_post_items for it.
 */
export async function getUnpostedEvents() {
  const now = new Date();

  // Subquery: event IDs that have been dealt with (posted or skipped)
  const dealtWith = db
    .select({ eventId: discordPostItems.eventId })
    .from(discordPostItems)
    .where(
      and(eq(discordPostItems.itemType, "event"), sql`${discordPostItems.eventId} IS NOT NULL`),
    )
    .as("dealt_with");

  // Events with upcoming dates
  const upcomingDateEventIds = await db
    .selectDistinct({ eventId: eventDates.eventId })
    .from(eventDates)
    .where(gte(eventDates.startDate, now));

  // Recurring events still active
  const recurringEvents = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        sql`${events.recurrenceRule} IS NOT NULL AND ${events.recurrenceRule} != ''`,
        or(isNull(events.recurrenceEnd), gte(events.recurrenceEnd, now)),
      ),
    );

  const upcomingIds = [
    ...new Set([
      ...upcomingDateEventIds.map((r) => r.eventId),
      ...recurringEvents.map((r) => r.id),
    ]),
  ];

  if (upcomingIds.length === 0) return [];

  // Get events that are upcoming, publicly visible, and not yet dealt with
  const results = await db
    .select()
    .from(events)
    .leftJoin(dealtWith, eq(events.id, dealtWith.eventId))
    .where(
      and(
        sql`${events.id} IN (${sql.join(
          upcomingIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
        isNull(dealtWith.eventId),
        or(isNull(events.importStatus), eq(events.importStatus, "published")),
      ),
    )
    .orderBy(events.title);

  // Fetch dates for each event
  const eventsWithDates = await Promise.all(
    results.map(async (row) => {
      const dates = await db
        .select()
        .from(eventDates)
        .where(eq(eventDates.eventId, row.events.id))
        .orderBy(eventDates.startDate);
      return { ...row.events, dates };
    }),
  );

  return eventsWithDates;
}

/**
 * Get active jobs that have not been posted or skipped to Discord.
 */
export async function getUnpostedJobs() {
  const dealtWith = db
    .select({ jobId: discordPostItems.jobId })
    .from(discordPostItems)
    .where(and(eq(discordPostItems.itemType, "job"), sql`${discordPostItems.jobId} IS NOT NULL`))
    .as("dealt_with");

  const results = await db
    .select({
      job: jobs,
      companyName: companies.name,
    })
    .from(jobs)
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .leftJoin(dealtWith, eq(jobs.id, dealtWith.jobId))
    .where(and(eq(jobs.status, "active"), isNull(dealtWith.jobId)))
    .orderBy(jobs.title);

  return results.map((r) => ({
    ...r.job,
    companyName: r.companyName,
  }));
}

// ============================================================================
// Create post records
// ============================================================================

/**
 * Create a discord post record and its items after successfully sending to Discord.
 */
export async function createDiscordPost(params: {
  channelType: DiscordChannelType;
  discordMessageId: string | null;
  discordChannelId: string;
  introText: string | null;
  itemIds: number[];
  itemType: "event" | "job";
}) {
  const post = await db
    .insert(discordPosts)
    .values({
      channelType: params.channelType,
      discordMessageId: params.discordMessageId,
      discordChannelId: params.discordChannelId,
      introText: params.introText,
      postedAt: new Date(),
    })
    .returning()
    .get();

  for (const itemId of params.itemIds) {
    await db.insert(discordPostItems).values({
      discordPostId: post.id,
      itemType: params.itemType,
      eventId: params.itemType === "event" ? itemId : null,
      jobId: params.itemType === "job" ? itemId : null,
      skipped: false,
    });
  }

  return post;
}

/**
 * Skip items -- mark them as dealt with without posting to Discord.
 */
export async function skipItems(params: {
  channelType: DiscordChannelType;
  discordChannelId: string;
  itemIds: number[];
  itemType: "event" | "job";
}) {
  const post = await db
    .insert(discordPosts)
    .values({
      channelType: params.channelType,
      discordMessageId: null,
      discordChannelId: params.discordChannelId,
      introText: null,
      postedAt: new Date(),
    })
    .returning()
    .get();

  for (const itemId of params.itemIds) {
    await db.insert(discordPostItems).values({
      discordPostId: post.id,
      itemType: params.itemType,
      eventId: params.itemType === "event" ? itemId : null,
      jobId: params.itemType === "job" ? itemId : null,
      skipped: true,
    });
  }

  return post;
}

// ============================================================================
// History
// ============================================================================

export interface DiscordPostWithItems {
  id: number;
  channelType: string;
  discordMessageId: string | null;
  introText: string | null;
  postedAt: Date;
  itemCount: number;
  skippedCount: number;
}

/**
 * Get recent post history for a channel type.
 */
export async function getPostHistory(
  channelType: DiscordChannelType,
  limit = 10,
): Promise<DiscordPostWithItems[]> {
  const posts = await db
    .select()
    .from(discordPosts)
    .where(eq(discordPosts.channelType, channelType))
    .orderBy(desc(discordPosts.postedAt))
    .limit(limit);

  const result: DiscordPostWithItems[] = [];
  for (const post of posts) {
    const items = await db
      .select()
      .from(discordPostItems)
      .where(eq(discordPostItems.discordPostId, post.id));

    const skippedCount = items.filter((i) => i.skipped).length;
    const postedCount = items.filter((i) => !i.skipped).length;

    result.push({
      id: post.id,
      channelType: post.channelType,
      discordMessageId: post.discordMessageId,
      introText: post.introText,
      postedAt: post.postedAt,
      itemCount: postedCount,
      skippedCount,
    });
  }

  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/discord-posts.server.ts
git commit -m "Add Discord posts database operations

- getUnpostedEvents: upcoming events not yet posted/skipped
- getUnpostedJobs: active jobs not yet posted/skipped
- createDiscordPost: record a sent message with its items
- skipItems: mark items as dealt with without posting
- getPostHistory: recent post history for a channel type"
```

---

### Task 6: Discord Events Compose Page

**Files:**

- Create: `app/routes/manage/discord/events.tsx`
- Modify: `app/routes.ts`

- [ ] **Step 1: Register the discord routes in `app/routes.ts`**

In `app/routes.ts`, inside the `...prefix("manage", [...])` block, add after the `route("export", ...)` line:

```typescript
...prefix("discord", [
  route("events", "routes/manage/discord/events.tsx"),
  route("jobs", "routes/manage/discord/jobs.tsx"),
]),
```

- [ ] **Step 2: Create the events compose page**

Create `app/routes/manage/discord/events.tsx`:

```tsx
import type { Route } from "./+types/events";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getDiscordConfig } from "~/lib/config.server";
import {
  getUnpostedEvents,
  createDiscordPost,
  skipItems,
  getPostHistory,
} from "~/lib/discord-posts.server";
import { buildEventsMessage } from "~/lib/discord-messages.server";
import { postMessage } from "~/lib/discord.server";
import { format } from "date-fns";
import { getGeneratedOccurrences } from "~/lib/events.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Discord Events - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [config, unpostedEvents, history] = await Promise.all([
    getDiscordConfig(),
    getUnpostedEvents(),
    getPostHistory("events"),
  ]);

  // For recurring events without explicit dates, generate synthetic dates
  const eventsWithDates = unpostedEvents.map((event) => {
    if (event.dates.length === 0 && event.recurrenceRule) {
      const occurrences = getGeneratedOccurrences(event);
      const syntheticDates = occurrences.slice(0, 1).map((date, i) => ({
        id: -(i + 1),
        eventId: event.id,
        startDate: date,
        endDate: null,
      }));
      return { ...event, dates: syntheticDates };
    }
    return event;
  });

  return {
    configured: Boolean(config.botToken && config.eventsChannelId),
    events: eventsWithDates,
    history,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const config = await getDiscordConfig();

  if (!config.botToken || !config.eventsChannelId) {
    return {
      error: "Discord is not configured. Please set bot token and events channel ID in Settings.",
    };
  }

  if (intent === "skip") {
    const eventId = Number(formData.get("eventId"));
    if (!eventId) return { error: "Invalid event ID" };

    await skipItems({
      channelType: "events",
      discordChannelId: config.eventsChannelId,
      itemIds: [eventId],
      itemType: "event",
    });
    return { success: true, skipped: true };
  }

  if (intent === "post") {
    const selectedIds = formData.getAll("selectedEvents").map(Number).filter(Boolean);
    if (selectedIds.length === 0) {
      return { error: "No events selected" };
    }

    const introText = (formData.get("introText") as string) || null;

    // Fetch the full event data for selected events
    const allUnposted = await getUnpostedEvents();
    const selectedEvents = allUnposted.filter((e) => selectedIds.includes(e.id));

    if (selectedEvents.length === 0) {
      return { error: "Selected events are no longer available" };
    }

    // For recurring events, generate synthetic dates for the message
    const eventsForMessage = selectedEvents.map((event) => {
      if (event.dates.length === 0 && event.recurrenceRule) {
        const occurrences = getGeneratedOccurrences(event);
        const syntheticDates = occurrences.slice(0, 1).map((date, i) => ({
          id: -(i + 1),
          eventId: event.id,
          startDate: date,
          endDate: null,
        }));
        return { ...event, dates: syntheticDates };
      }
      return event;
    });

    const components = buildEventsMessage(eventsForMessage, introText || undefined);
    const result = await postMessage(config.eventsChannelId, components, config.botToken);

    if (!result.success) {
      return { error: `Failed to post to Discord: ${result.error}` };
    }

    await createDiscordPost({
      channelType: "events",
      discordMessageId: result.messageId || null,
      discordChannelId: config.eventsChannelId,
      introText,
      itemIds: selectedIds,
      itemType: "event",
    });

    return { success: true, posted: selectedEvents.length };
  }

  return { error: "Unknown action" };
}

export default function DiscordEvents() {
  const { configured, events, history } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isPosting =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "post";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-harbour-700">Discord Events</h1>
            <p className="text-harbour-400 text-sm">Compose and post event roundups to Discord</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/manage/discord/jobs"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              Jobs
            </Link>
            <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
              Dashboard
            </Link>
          </div>
        </div>

        {!configured && (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            Discord is not configured.{" "}
            <Link to="/manage/settings" className="underline hover:text-amber-900">
              Go to Settings
            </Link>{" "}
            to set your bot token and events channel ID.
          </div>
        )}

        {actionData && "error" in actionData && actionData.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
            {actionData.error}
          </div>
        )}

        {actionData && "posted" in actionData && actionData.posted && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-700 text-sm">
            Posted {actionData.posted} event{actionData.posted !== 1 ? "s" : ""} to Discord.
          </div>
        )}

        {actionData && "skipped" in actionData && actionData.skipped && (
          <div className="p-4 bg-harbour-50 border border-harbour-200 text-harbour-600 text-sm">
            Event skipped.
          </div>
        )}

        {configured && events.length === 0 && (
          <div className="p-6 bg-white border border-harbour-200 text-harbour-400 text-sm text-center">
            No unposted upcoming events. All caught up!
          </div>
        )}

        {configured && events.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="post" />

            <div className="flex flex-col gap-4">
              <div className="bg-white border border-harbour-200 p-6">
                <h2 className="text-lg font-semibold text-harbour-700 mb-4">
                  Unposted Events ({events.length})
                </h2>

                <div className="flex flex-col gap-2">
                  {events.map((event) => {
                    const nextDate = event.dates[0];
                    const dateLine = nextDate
                      ? format(new Date(nextDate.startDate), "EEE, MMM d 'at' h:mm a")
                      : "Recurring";
                    return (
                      <div
                        key={event.id}
                        className="flex items-start gap-4 p-4 border border-harbour-100"
                      >
                        <input
                          type="checkbox"
                          name="selectedEvents"
                          value={event.id}
                          defaultChecked
                          className="mt-1 h-4 w-4 text-harbour-600 border border-harbour-300 focus:ring-harbour-500"
                        />
                        <div className="flex-1 flex flex-col gap-1">
                          <span className="font-medium text-harbour-700">{event.title}</span>
                          <span className="text-sm text-harbour-400">
                            {dateLine}
                            {event.location ? ` \u2022 ${event.location}` : ""}
                          </span>
                        </div>
                        <Form method="post" className="flex-shrink-0">
                          <input type="hidden" name="intent" value="skip" />
                          <input type="hidden" name="eventId" value={event.id} />
                          <button
                            type="submit"
                            className="text-xs px-2 py-1 border border-harbour-200 text-harbour-400 hover:text-harbour-600 hover:border-harbour-400 transition-colors"
                          >
                            Skip
                          </button>
                        </Form>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-harbour-200 p-6">
                <h2 className="text-lg font-semibold text-harbour-700 mb-4">
                  Intro Text (optional)
                </h2>
                <textarea
                  name="introText"
                  rows={3}
                  placeholder="e.g., Here's what's coming up this week!"
                  className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPosting}
                  className="px-6 py-2 bg-harbour-600 text-white hover:bg-harbour-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isPosting ? "Posting..." : "Post to Discord"}
                </button>
              </div>
            </div>
          </Form>
        )}

        {history.length > 0 && (
          <div className="bg-white border border-harbour-200 p-6">
            <h2 className="text-lg font-semibold text-harbour-700 mb-4">Recent Posts</h2>
            <div className="flex flex-col divide-y divide-harbour-100">
              {history.map((post) => (
                <div key={post.id} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-harbour-700">
                      {post.discordMessageId
                        ? `Posted ${post.itemCount} event${post.itemCount !== 1 ? "s" : ""}`
                        : `Skipped ${post.skippedCount} event${post.skippedCount !== 1 ? "s" : ""}`}
                    </span>
                    {post.introText && (
                      <span className="text-harbour-400 text-xs truncate max-w-sm">
                        {post.introText}
                      </span>
                    )}
                  </div>
                  <span className="text-harbour-400 text-xs">
                    {format(new Date(post.postedAt), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/routes/manage/discord/events.tsx app/routes.ts
git commit -m "Add Discord events compose page

- Shows unposted upcoming events with select/skip controls
- Optional intro text for the message
- Posts to Discord using Components v2
- Recent post history section"
```

---

### Task 7: Discord Jobs Compose Page

**Files:**

- Create: `app/routes/manage/discord/jobs.tsx`

- [ ] **Step 1: Create the jobs compose page**

Create `app/routes/manage/discord/jobs.tsx`:

```tsx
import type { Route } from "./+types/jobs";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getDiscordConfig } from "~/lib/config.server";
import {
  getUnpostedJobs,
  createDiscordPost,
  skipItems,
  getPostHistory,
} from "~/lib/discord-posts.server";
import { buildJobsMessage } from "~/lib/discord-messages.server";
import { postMessage } from "~/lib/discord.server";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Discord Jobs - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [config, unpostedJobs, history] = await Promise.all([
    getDiscordConfig(),
    getUnpostedJobs(),
    getPostHistory("jobs"),
  ]);

  return {
    configured: Boolean(config.botToken && config.jobsChannelId),
    jobs: unpostedJobs,
    history,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const config = await getDiscordConfig();

  if (!config.botToken || !config.jobsChannelId) {
    return {
      error: "Discord is not configured. Please set bot token and jobs channel ID in Settings.",
    };
  }

  if (intent === "skip") {
    const jobId = Number(formData.get("jobId"));
    if (!jobId) return { error: "Invalid job ID" };

    await skipItems({
      channelType: "jobs",
      discordChannelId: config.jobsChannelId,
      itemIds: [jobId],
      itemType: "job",
    });
    return { success: true, skipped: true };
  }

  if (intent === "post") {
    const selectedIds = formData.getAll("selectedJobs").map(Number).filter(Boolean);
    if (selectedIds.length === 0) {
      return { error: "No jobs selected" };
    }

    const introText = (formData.get("introText") as string) || null;

    const allUnposted = await getUnpostedJobs();
    const selectedJobs = allUnposted.filter((j) => selectedIds.includes(j.id));

    if (selectedJobs.length === 0) {
      return { error: "Selected jobs are no longer available" };
    }

    const jobsForMessage = selectedJobs.map((j) => ({
      slug: j.slug,
      title: j.title,
      location: j.location,
      workplaceType: j.workplaceType,
      companyName: j.companyName,
    }));

    const components = buildJobsMessage(jobsForMessage, introText || undefined);
    const result = await postMessage(config.jobsChannelId, components, config.botToken);

    if (!result.success) {
      return { error: `Failed to post to Discord: ${result.error}` };
    }

    await createDiscordPost({
      channelType: "jobs",
      discordMessageId: result.messageId || null,
      discordChannelId: config.jobsChannelId,
      introText,
      itemIds: selectedIds,
      itemType: "job",
    });

    return { success: true, posted: selectedJobs.length };
  }

  return { error: "Unknown action" };
}

export default function DiscordJobs() {
  const { configured, jobs, history } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isPosting =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "post";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-harbour-700">Discord Jobs</h1>
            <p className="text-harbour-400 text-sm">Compose and post job roundups to Discord</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/manage/discord/events"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              Events
            </Link>
            <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
              Dashboard
            </Link>
          </div>
        </div>

        {!configured && (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            Discord is not configured.{" "}
            <Link to="/manage/settings" className="underline hover:text-amber-900">
              Go to Settings
            </Link>{" "}
            to set your bot token and jobs channel ID.
          </div>
        )}

        {actionData && "error" in actionData && actionData.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
            {actionData.error}
          </div>
        )}

        {actionData && "posted" in actionData && actionData.posted && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-700 text-sm">
            Posted {actionData.posted} job{actionData.posted !== 1 ? "s" : ""} to Discord.
          </div>
        )}

        {actionData && "skipped" in actionData && actionData.skipped && (
          <div className="p-4 bg-harbour-50 border border-harbour-200 text-harbour-600 text-sm">
            Job skipped.
          </div>
        )}

        {configured && jobs.length === 0 && (
          <div className="p-6 bg-white border border-harbour-200 text-harbour-400 text-sm text-center">
            No unposted active jobs. All caught up!
          </div>
        )}

        {configured && jobs.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="post" />

            <div className="flex flex-col gap-4">
              <div className="bg-white border border-harbour-200 p-6">
                <h2 className="text-lg font-semibold text-harbour-700 mb-4">
                  Unposted Jobs ({jobs.length})
                </h2>

                <div className="flex flex-col gap-2">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-start gap-4 p-4 border border-harbour-100"
                    >
                      <input
                        type="checkbox"
                        name="selectedJobs"
                        value={job.id}
                        defaultChecked
                        className="mt-1 h-4 w-4 text-harbour-600 border border-harbour-300 focus:ring-harbour-500"
                      />
                      <div className="flex-1 flex flex-col gap-1">
                        <span className="font-medium text-harbour-700">{job.title}</span>
                        <span className="text-sm text-harbour-400">
                          {[job.companyName, job.location, job.workplaceType]
                            .filter(Boolean)
                            .join(" \u2022 ")}
                        </span>
                      </div>
                      <Form method="post" className="flex-shrink-0">
                        <input type="hidden" name="intent" value="skip" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="text-xs px-2 py-1 border border-harbour-200 text-harbour-400 hover:text-harbour-600 hover:border-harbour-400 transition-colors"
                        >
                          Skip
                        </button>
                      </Form>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-harbour-200 p-6">
                <h2 className="text-lg font-semibold text-harbour-700 mb-4">
                  Intro Text (optional)
                </h2>
                <textarea
                  name="introText"
                  rows={3}
                  placeholder="e.g., Fresh job postings from the local tech scene!"
                  className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPosting}
                  className="px-6 py-2 bg-harbour-600 text-white hover:bg-harbour-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isPosting ? "Posting..." : "Post to Discord"}
                </button>
              </div>
            </div>
          </Form>
        )}

        {history.length > 0 && (
          <div className="bg-white border border-harbour-200 p-6">
            <h2 className="text-lg font-semibold text-harbour-700 mb-4">Recent Posts</h2>
            <div className="flex flex-col divide-y divide-harbour-100">
              {history.map((post) => (
                <div key={post.id} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-harbour-700">
                      {post.discordMessageId
                        ? `Posted ${post.itemCount} job${post.itemCount !== 1 ? "s" : ""}`
                        : `Skipped ${post.skippedCount} job${post.skippedCount !== 1 ? "s" : ""}`}
                    </span>
                    {post.introText && (
                      <span className="text-harbour-400 text-xs truncate max-w-sm">
                        {post.introText}
                      </span>
                    )}
                  </div>
                  <span className="text-harbour-400 text-xs">
                    {format(new Date(post.postedAt), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/manage/discord/jobs.tsx
git commit -m "Add Discord jobs compose page

- Shows unposted active jobs with select/skip controls
- Optional intro text for the message
- Posts to Discord using Components v2
- Recent post history section"
```

---

### Task 8: Dashboard Links

**Files:**

- Modify: `app/routes/manage/index.tsx`

- [ ] **Step 1: Add Discord section to the manage dashboard**

In `app/routes/manage/index.tsx`, after the Export Tools section (after the closing `</div>` of the Export Tools grid, around line 236), add:

```tsx
<div className="flex flex-col gap-4">
  <h2 className="text-lg font-semibold text-harbour-700">Discord</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <Link
      to="/manage/discord/events"
      className="p-4 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-1"
    >
      <h3 className="font-medium text-harbour-700">Post Events</h3>
      <p className="text-harbour-400 text-sm">Compose and post event roundups to Discord</p>
    </Link>
    <Link
      to="/manage/discord/jobs"
      className="p-4 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-1"
    >
      <h3 className="font-medium text-harbour-700">Post Jobs</h3>
      <p className="text-harbour-400 text-sm">Compose and post job roundups to Discord</p>
    </Link>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add app/routes/manage/index.tsx
git commit -m "Add Discord links to manage dashboard"
```

---

### Task 9: Lint, Build, and Final Verification

- [ ] **Step 1: Run lint fix**

```bash
pnpm run lint:fix
```

Fix any issues.

- [ ] **Step 2: Run build**

```bash
pnpm run build
```

Fix any type errors or build failures.

- [ ] **Step 3: Final commit if lint/build required fixes**

```bash
git add -A
git commit -m "Fix lint and build issues"
```
