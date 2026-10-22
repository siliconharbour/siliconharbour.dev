import { randomUUID } from "node:crypto";
import { ConflictError, InvalidOperationError } from "~/operations/errors";
import { getDiscordConfig } from "./config.server";
import { listDestinations } from "./discord-destinations.server";
import {
  getUnpostedEvents,
  getUnpostedJobs,
  createDiscordPost,
  skipItems,
} from "./discord-posts.server";
import { buildEventsMessage, buildJobsMessage } from "./discord-messages.server";
import { getGeneratedOccurrences } from "./events.server";
import { postMessage, logDiscord } from "./discord.server";

type ChannelType = "events" | "jobs";
async function roundupMessages(type: ChannelType, itemIds: number[], introText?: string | null) {
  if (type === "jobs") {
    const jobs = (await getUnpostedJobs()).filter((job) => itemIds.includes(job.id));
    if (jobs.length !== itemIds.length)
      throw new ConflictError("Selected jobs are no longer available");
    return buildJobsMessage(jobs, introText ?? undefined);
  }
  const events = (await getUnpostedEvents()).filter((event) => itemIds.includes(event.id));
  if (events.length !== itemIds.length)
    throw new ConflictError("Selected events are no longer available");
  const rows = events.map((event) =>
    event.dates.length === 0 && event.recurrenceRule
      ? {
          ...event,
          dates: getGeneratedOccurrences(event)
            .slice(0, 1)
            .map((date, index) => ({
              id: -(index + 1),
              eventId: event.id,
              startDate: date,
              endDate: null,
              isAllDay: !event.defaultStartTime,
            })),
        }
      : event,
  );
  return [buildEventsMessage(rows, introText ?? undefined)];
}
export async function postDiscordRoundup(
  type: ChannelType,
  itemIds: number[],
  introText?: string | null,
) {
  const { botToken } = await getDiscordConfig();
  if (!botToken)
    throw new ConflictError("Discord is not configured. Set the bot token in Settings.");
  const destinations = await listDestinations(type);
  if (!destinations.length)
    throw new ConflictError(`No ${type} destinations configured. Add one in Settings.`);
  const messages = await roundupMessages(type, itemIds, introText);
  const batchId = randomUUID();
  const successes: Array<{ destination: (typeof destinations)[number]; messageId: string | null }> =
    [];
  const failures: Array<{ channelName: string; guildName: string; error: string }> = [];
  logDiscord("batch.started", {
    batchId,
    channelType: type,
    itemIds,
    destinationCount: destinations.length,
    chunkCount: messages.length,
  });
  for (const destination of destinations) {
    const messageIds: string[] = [];
    let error: string | null = null;
    for (let index = 0; index < messages.length; index++) {
      const result = await postMessage(destination.channelId, messages[index], botToken, {
        batchId,
        channelType: type,
        destinationId: destination.id,
        chunkIndex: index + 1,
        chunkCount: messages.length,
      });
      if (!result.success) {
        error = `${result.error ?? "Unknown error"}${messageIds.length ? ` (${messageIds.length} message(s) already sent)` : ""}`;
        break;
      }
      if (result.messageId) messageIds.push(result.messageId);
    }
    if (error)
      failures.push({
        channelName: destination.channelName,
        guildName: destination.guildName,
        error,
      });
    else successes.push({ destination, messageId: messageIds[0] ?? null });
  }
  if (!successes.length)
    throw new InvalidOperationError(
      `Failed to post to any destination: ${failures.map((row) => `#${row.channelName} (${row.error})`).join("; ")}`,
    );
  for (let index = 0; index < successes.length; index++) {
    const { destination, messageId } = successes[index];
    await createDiscordPost({
      channelType: type,
      discordMessageId: messageId,
      destination: { guildId: destination.guildId, channelId: destination.channelId },
      batchId,
      introText: introText ?? null,
      itemIds,
      itemType: type === "events" ? "event" : "job",
      attachItems: index === 0,
    });
  }
  logDiscord("batch.recorded", {
    batchId,
    channelType: type,
    destinationSuccessCount: successes.length,
    destinationFailureCount: failures.length,
  });
  return {
    success: true as const,
    posted: itemIds.length,
    destinations: successes.length,
    failures,
    batchId,
  };
}
export async function skipDiscordItems(type: ChannelType, itemIds: number[]) {
  const available = type === "events" ? await getUnpostedEvents() : await getUnpostedJobs();
  const allowed = new Set(available.map((item) => item.id));
  if (itemIds.some((id) => !allowed.has(id)))
    throw new ConflictError("Selected items are no longer available");
  await skipItems({ channelType: type, itemIds, itemType: type === "events" ? "event" : "job" });
  return { skipped: itemIds.length };
}
export async function skipOldDiscordJobs(now: Date) {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60_000;
  const jobs = (await getUnpostedJobs()).filter(
    (job) => (job.postedAt ?? job.firstSeenAt ?? job.createdAt).getTime() < cutoff,
  );
  if (!jobs.length) throw new InvalidOperationError("No jobs older than a week to skip");
  await skipItems({ channelType: "jobs", itemIds: jobs.map((job) => job.id), itemType: "job" });
  return { skippedOld: jobs.length };
}
