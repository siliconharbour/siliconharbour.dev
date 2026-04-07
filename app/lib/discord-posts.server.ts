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
      and(
        eq(discordPostItems.itemType, "event"),
        sql`${discordPostItems.eventId} IS NOT NULL`
      )
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
        or(isNull(events.recurrenceEnd), gte(events.recurrenceEnd, now))
      )
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
          sql`, `
        )})`,
        isNull(dealtWith.eventId),
        or(isNull(events.importStatus), eq(events.importStatus, "published"))
      )
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
    })
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
    .where(
      and(
        eq(discordPostItems.itemType, "job"),
        sql`${discordPostItems.jobId} IS NOT NULL`
      )
    )
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
  limit = 10
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
