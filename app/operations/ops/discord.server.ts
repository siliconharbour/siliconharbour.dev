import { getEventWithOccurrences } from "~/lib/events.server";
import { getPostHistoryPage } from "~/lib/discord-posts.server";
import { listInput, page, collectionPage } from "../listing";
import { z } from "zod";
import { defineOperation } from "../define";
import { ConflictError, InvalidOperationError, NotFoundError } from "../errors";
import { emptyInput, confirm, text, deleteInput } from "../fields";
import { toPlain } from "../plain";
import {
  discordTypeInput,
  discordDestinationAddInput,
  discordDestinationOutput,
  discordTestInput,
  discordTestOutput,
  discordGuildOutput,
  discordChannelOutput,
  discordPostInput,
  discordPostOutput,
  discordSkipInput,
  discordHistoryInput,
  discordHistoryOutput,
} from "../contracts/discord";
import { eventOutput } from "../contracts/events";
import { jobOutput } from "../contracts/jobs";
import { getDiscordConfig } from "~/lib/config.server";
import {
  listDestinations,
  addDestination,
  removeDestination,
} from "~/lib/discord-destinations.server";
import { verifyBotToken, listGuilds, listPostableChannels } from "~/lib/discord.server";
import {
  getUnpostedEvents,
  getUnpostedJobs,
  undoDiscordPost,
  undoDiscordBatch,
} from "~/lib/discord-posts.server";
import {
  postDiscordRoundup,
  skipDiscordItems,
  skipOldDiscordJobs,
} from "~/lib/discord-roundup.server";
async function botToken() {
  const config = await getDiscordConfig();
  if (!config.botToken) throw new ConflictError("Bot token not configured");
  return config.botToken;
}
export const discordOperations = {
  discordTest: defineOperation({
    name: "discordTest",
    area: "discord",
    risk: "external",
    access: "admin",
    summary: "Test the Discord bot token.",
    description:
      "Verify a supplied token, or the stored token when omitted, and report the bot identity and guild count. No token is included in the output. Requires confirm: true.",
    input: discordTestInput,
    output: discordTestOutput,
    examples: [{ title: "Test stored token", input: { confirm: true } }],
    run: async (_ctx, input) => {
      const token = input.token ?? (await botToken());
      const result = await verifyBotToken(token);
      if (!result.valid) return result;
      const guilds = await listGuilds(token);
      return { ...result, guildCount: guilds.guilds?.length ?? 0 };
    },
  }),
  discordGuildsList: defineOperation({
    name: "discordGuildsList",
    area: "discord",
    risk: "read",
    access: "admin",
    summary: "List the bot's Discord guilds.",
    description:
      "Read live Discord guild IDs and names using the stored bot token. No credentials are returned.",
    input: listInput(["name"]),
    output: page(discordGuildOutput),
    examples: [{ title: "Guilds", input: {} }],
    run: async (_ctx, input) => {
      const result = await listGuilds(await botToken());
      if (!result.ok) throw new InvalidOperationError(result.error ?? "Failed to load guilds");
      const rows = (result.guilds ?? []).map((guild) => ({ id: guild.id, name: guild.name }));
      return collectionPage(rows, input, { name: (row) => row.name });
    },
  }),
  discordChannelsList: defineOperation({
    name: "discordChannelsList",
    area: "discord",
    risk: "read",
    access: "admin",
    summary: "List postable Discord channels for a guild.",
    description:
      "Read live channel permissions using the stored bot token. Include channels the bot cannot send to with a reason.",
    input: listInput(["name"])
      .extend({ guildId: text("guildId", 32).regex(/^\d+$/) })
      .strict(),
    output: page(discordChannelOutput),
    examples: [{ title: "Channels", input: { guildId: "123456789012345678" } }],
    run: async (_ctx, input) => {
      const result = await listPostableChannels(input.guildId, await botToken());
      if (!result.ok) throw new InvalidOperationError(result.error ?? "Failed to load channels");
      const rows = result.channels ?? [];
      return collectionPage(rows, input, { name: (row) => row.name });
    },
  }),
  discordDestinationList: defineOperation({
    name: "discordDestinationList",
    area: "discord",
    risk: "read",
    access: "admin",
    summary: "List Discord posting destinations.",
    description:
      "Return configured guild/channel destinations for event or job roundups. This reads stored configuration only.",
    input: listInput(["name"]).extend({ type: discordTypeInput.shape.type }).strict(),
    output: page(discordDestinationOutput),
    examples: [{ title: "Event destinations", input: { type: "events" } }],
    run: async (_ctx, input) =>
      toPlain(
        collectionPage(await listDestinations(input.type), input, {
          name: (row) => `${row.guildName} ${row.channelName}`,
        }),
      ),
  }),
  discordDestinationAdd: defineOperation({
    name: "discordDestinationAdd",
    area: "discord",
    risk: "write",
    access: "admin",
    summary: "Add a Discord posting destination.",
    description:
      "Store a guild/channel destination. Re-adding the same type/channel refreshes its display names. Does not post a message.",
    input: discordDestinationAddInput,
    output: discordDestinationOutput,
    examples: [
      {
        title: "Add channel",
        input: {
          type: "events",
          guildId: "123",
          guildName: "Community",
          channelId: "456",
          channelName: "events",
        },
      },
    ],
    run: async (_ctx, input) => {
      const record = await addDestination(input);
      if (!record) throw new ConflictError("Destination was not saved");
      return toPlain(record);
    },
  }),
  discordDestinationRemove: defineOperation({
    name: "discordDestinationRemove",
    area: "discord",
    risk: "destructive",
    access: "admin",
    summary: "Remove a Discord destination.",
    description:
      "Remove the stored destination without deleting posted messages or history. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ removed: z.literal(true) }).strict(),
    examples: [{ title: "Remove destination", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => {
      if (!(await removeDestination(id))) throw new NotFoundError("Discord destination not found");
      return { removed: true as const };
    },
  }),
  discordUnpostedList: defineOperation({
    name: "discordUnpostedList",
    area: "discord",
    risk: "read",
    access: "admin",
    summary: "List items awaiting a Discord roundup.",
    description:
      "Return eligible public events or active jobs not already posted or skipped. Event records retain recurrence fields for message generation.",
    input: listInput(["createdAt", "title"]).extend({ type: discordTypeInput.shape.type }).strict(),
    output: page(
      z.union([eventOutput, jobOutput.extend({ companyName: z.string().nullable() }).strict()]),
    ),
    examples: [{ title: "Unposted events", input: { type: "events" } }],
    run: async (_ctx, input) => {
      const rows =
        input.type === "events"
          ? await Promise.all(
              (await getUnpostedEvents()).map(async (event) => {
                if (event.dates.length || !event.recurrenceRule) return event;
                const occurrence = (await getEventWithOccurrences(event.id))?.occurrences.find(
                  (item) => !item.cancelled,
                );
                return {
                  ...event,
                  dates: occurrence
                    ? [
                        {
                          id: -1,
                          eventId: event.id,
                          startDate: occurrence.date,
                          endDate: occurrence.endDate,
                          isAllDay: !event.defaultStartTime,
                        },
                      ]
                    : [],
                };
              }),
            )
          : await getUnpostedJobs();
      return toPlain(
        collectionPage(rows as Array<(typeof rows)[number]>, input, {
          createdAt: (row) => row.createdAt,
          title: (row) => row.title,
        }),
      );
    },
  }),
  discordPost: defineOperation({
    name: "discordPost",
    area: "discord",
    risk: "external",
    access: "admin",
    summary: "Post an event or job roundup to Discord.",
    description:
      "Require selected items to remain eligible, build the site's messages, post all chunks to each configured destination, and record successful destinations as one batch. Return partial destination failures for review. Requires confirm: true.",
    input: discordPostInput,
    output: discordPostOutput,
    examples: [{ title: "Post events", input: { type: "events", itemIds: [1], confirm: true } }],
    run: (_ctx, { type, itemIds, introText }) => postDiscordRoundup(type, itemIds, introText),
  }),
  discordSkip: defineOperation({
    name: "discordSkip",
    area: "discord",
    risk: "write",
    access: "admin",
    summary: "Skip items in the Discord queue.",
    description:
      "Record eligible event/job IDs as skipped so they no longer appear in the unposted queue. No Discord request runs.",
    input: discordSkipInput,
    output: z.object({ skipped: z.number() }).strict(),
    examples: [{ title: "Skip event", input: { type: "events", itemIds: [1] } }],
    run: (_ctx, { type, itemIds }) => skipDiscordItems(type, itemIds),
  }),
  discordSkipOld: defineOperation({
    name: "discordSkipOld",
    area: "discord",
    risk: "write",
    access: "admin",
    summary: "Skip Discord jobs older than a week.",
    description:
      "Use postedAt, then firstSeenAt, then createdAt against the operation clock. Record old unposted jobs as skipped without contacting Discord.",
    input: emptyInput,
    output: z.object({ skippedOld: z.number() }).strict(),
    examples: [{ title: "Skip old jobs", input: {} }],
    run: (ctx) => skipOldDiscordJobs(ctx.now()),
  }),
  discordUndo: defineOperation({
    name: "discordUndo",
    area: "discord",
    risk: "destructive",
    access: "admin",
    summary: "Undo tracking for one Discord post.",
    description:
      "Remove the stored post record. Items are requeued only when that record owns them; use discordUndoBatch for an entire fan-out. Preserve existing admin behavior: actual Discord messages remain in their channels. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ undone: z.literal(true) }).strict(),
    examples: [{ title: "Undo post tracking", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => {
      if (!(await undoDiscordPost(id)).changes) throw new NotFoundError("Discord post not found");
      return { undone: true as const };
    },
  }),
  discordUndoBatch: defineOperation({
    name: "discordUndoBatch",
    area: "discord",
    risk: "destructive",
    access: "admin",
    summary: "Undo tracking for an entire Discord batch.",
    description:
      "Remove all stored post rows in the batch and requeue their items. This follows the existing admin action and leaves actual Discord messages in place. Requires confirm: true.",
    input: z.object({ batchId: text("batchId", 100), confirm }).strict(),
    output: z.object({ undone: z.literal(true) }).strict(),
    examples: [{ title: "Undo batch", input: { batchId: "example", confirm: true } }],
    run: async (_ctx, { batchId }) => {
      if (!(await undoDiscordBatch(batchId)).changes)
        throw new NotFoundError("Discord batch not found");
      return { undone: true as const };
    },
  }),
  discordPostHistory: defineOperation({
    name: "discordPostHistory",
    area: "discord",
    risk: "read",
    access: "admin",
    summary: "List Discord posting history by batch.",
    description:
      "Return recent stored batches with destination message IDs, item counts, and skipped counts. No Discord request runs.",
    input: discordHistoryInput,
    output: discordHistoryOutput,
    examples: [{ title: "Event history", input: { type: "events" } }],
    run: async (_ctx, input) => toPlain(await getPostHistoryPage(input.type, input)),
  }),
};
