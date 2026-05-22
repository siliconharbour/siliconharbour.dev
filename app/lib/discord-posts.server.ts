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

  // Sort by earliest upcoming date (soonest first), recurring events without dates go last
  eventsWithDates.sort((a, b) => {
    const aDate = a.dates[0]?.startDate ? new Date(a.dates[0].startDate).getTime() : Infinity;
    const bDate = b.dates[0]?.startDate ? new Date(b.dates[0].startDate).getTime() : Infinity;
    return aDate - bDate;
  });

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

export interface DestinationRef {
  guildId: string;
  channelId: string;
}

/**
 * Record a successful post to one Discord destination.
 *
 * When posting to multiple destinations in a single fan-out, pass the same
 * batchId to every call. The first call (i.e. the one that links the
 * discord_post_items rows) should pass attachItems: true; subsequent calls in
 * the same batch should pass attachItems: false so items aren't duplicated.
 */
export async function createDiscordPost(params: {
  channelType: DiscordChannelType;
  discordMessageId: string | null;
  destination: DestinationRef;
  batchId: string;
  introText: string | null;
  itemIds: number[];
  itemType: "event" | "job";
  attachItems: boolean;
}) {
  const post = await db
    .insert(discordPosts)
    .values({
      channelType: params.channelType,
      discordMessageId: params.discordMessageId,
      discordChannelId: params.destination.channelId,
      discordGuildId: params.destination.guildId,
      batchId: params.batchId,
      introText: params.introText,
      postedAt: new Date(),
    })
    .returning()
    .get();

  if (params.attachItems) {
    for (const itemId of params.itemIds) {
      await db.insert(discordPostItems).values({
        discordPostId: post.id,
        itemType: params.itemType,
        eventId: params.itemType === "event" ? itemId : null,
        jobId: params.itemType === "job" ? itemId : null,
        skipped: false,
      });
    }
  }

  return post;
}

/**
 * Skip items -- mark them as dealt with without posting to Discord.
 *
 * Records a single discord_posts row with discord_message_id = null, tied to
 * a synthetic destination (defaults to a sentinel channel id of "skipped" so
 * the schema's NOT NULL constraint is satisfied without claiming a real channel).
 */
export async function skipItems(params: {
  channelType: DiscordChannelType;
  itemIds: number[];
  itemType: "event" | "job";
}) {
  const post = await db
    .insert(discordPosts)
    .values({
      channelType: params.channelType,
      discordMessageId: null,
      discordChannelId: "skipped",
      discordGuildId: null,
      batchId: null,
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
// Undo / requeue
// ============================================================================

/**
 * Undo a discord post — deletes the post record (and cascades to items),
 * which makes the events/jobs reappear in the unposted queue.
 *
 * NOTE: for batches (fan-outs to multiple destinations), only the row that
 * owns the discord_post_items will requeue items when deleted. Sibling rows
 * in the same batch can be deleted without requeuing. Use undoDiscordBatch
 * to undo the whole fan-out at once.
 *
 * Does NOT delete the actual Discord message from the channel.
 */
export async function undoDiscordPost(postId: number) {
  return db.delete(discordPosts).where(eq(discordPosts.id, postId));
}

/**
 * Undo every discord_posts row that shares a batch_id. Cascades items.
 */
export async function undoDiscordBatch(batchId: string) {
  return db.delete(discordPosts).where(eq(discordPosts.batchId, batchId));
}

// ============================================================================
// History
// ============================================================================

export interface DiscordPostBatch {
  /** batch_id when fan-out posted, otherwise null for a singleton (e.g. skip) */
  batchId: string | null;
  channelType: string;
  introText: string | null;
  postedAt: Date;
  /** Number of items posted (deduped across destinations in the batch) */
  itemCount: number;
  skippedCount: number;
  /** All post rows in this batch, one per destination */
  destinations: Array<{
    id: number;
    discordMessageId: string | null;
    discordGuildId: string | null;
    discordChannelId: string;
  }>;
}

/**
 * Get recent post history for a channel type, grouped by batch.
 *
 * Skipped posts (batch_id = null) appear as singleton batches.
 */
export async function getPostHistory(
  channelType: DiscordChannelType,
  limit = 10,
): Promise<DiscordPostBatch[]> {
  // Pull a larger window than `limit` because batches collapse multiple rows.
  const posts = await db
    .select()
    .from(discordPosts)
    .where(eq(discordPosts.channelType, channelType))
    .orderBy(desc(discordPosts.postedAt))
    .limit(limit * 4);

  // Group by batchId; null batchId is its own singleton group keyed by post.id.
  const groups = new Map<string, typeof posts>();
  for (const post of posts) {
    const key = post.batchId ?? `__single_${post.id}`;
    const arr = groups.get(key);
    if (arr) arr.push(post);
    else groups.set(key, [post]);
  }

  const batches: DiscordPostBatch[] = [];
  for (const group of groups.values()) {
    // Use the earliest posted_at in the batch for sorting
    const earliest = group.reduce((a, b) => (a.postedAt < b.postedAt ? a : b));

    // Items are attached to (at most) one row in the batch; pick whichever has them.
    let itemCount = 0;
    let skippedCount = 0;
    for (const post of group) {
      const items = await db
        .select()
        .from(discordPostItems)
        .where(eq(discordPostItems.discordPostId, post.id));
      if (items.length > 0) {
        skippedCount = items.filter((i) => i.skipped).length;
        itemCount = items.filter((i) => !i.skipped).length;
        break;
      }
    }

    batches.push({
      batchId: earliest.batchId,
      channelType: earliest.channelType,
      introText: earliest.introText,
      postedAt: earliest.postedAt,
      itemCount,
      skippedCount,
      destinations: group.map((p) => ({
        id: p.id,
        discordMessageId: p.discordMessageId,
        discordGuildId: p.discordGuildId,
        discordChannelId: p.discordChannelId,
      })),
    });
  }

  batches.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
  return batches.slice(0, limit);
}
