import { listInput, page } from "../listing";
import { z } from "zod";
import { discordChannelTypes } from "../fields";
export const discordDestinationOutput = z
  .object({
    id: z.number(),
    channelType: z.enum(discordChannelTypes),
    guildId: z.string(),
    guildName: z.string(),
    channelId: z.string(),
    channelName: z.string(),
    createdAt: z.iso.datetime(),
  })
  .strict();
import { text, nullableText, ids, confirm } from "../fields";
export const discordTypeInput = z.object({ type: z.enum(discordChannelTypes) }).strict();
export const discordDestinationAddInput = z
  .object({
    type: z.enum(discordChannelTypes),
    guildId: text("guildId", 32).regex(/^\d+$/),
    guildName: text("guildName", 300),
    channelId: text("channelId", 32).regex(/^\d+$/),
    channelName: text("channelName", 300),
  })
  .strict();
export const discordPostInput = discordTypeInput
  .extend({ itemIds: ids(), introText: nullableText(2000).optional(), confirm })
  .strict();
export const discordSkipInput = discordTypeInput.extend({ itemIds: ids() }).strict();
export const discordTestInput = z
  .object({ token: text("token", 500).optional(), confirm })
  .strict();
export const discordTestOutput = z
  .object({
    valid: z.boolean(),
    username: z.string().optional(),
    userId: z.string().optional(),
    error: z.string().optional(),
    guildCount: z.number().optional(),
  })
  .strict();
export const discordGuildOutput = z.object({ id: z.string(), name: z.string() }).strict();
export const discordChannelOutput = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.number(),
    position: z.number(),
    parentId: z.string().nullable(),
    canSend: z.boolean(),
    reason: z.string().optional(),
  })
  .strict();
export const discordPostOutput = z
  .object({
    success: z.literal(true),
    posted: z.number(),
    destinations: z.number(),
    failures: z.array(
      z.object({ channelName: z.string(), guildName: z.string(), error: z.string() }).strict(),
    ),
    batchId: z.string(),
  })
  .strict();
export const discordHistoryInput = listInput(["postedAt"])
  .extend({ type: discordTypeInput.shape.type })
  .strict();
const discordHistoryItem = z
  .object({
    batchId: z.string().nullable(),
    channelType: z.string(),
    introText: z.string().nullable(),
    postedAt: z.string(),
    itemCount: z.number(),
    skippedCount: z.number(),
    destinations: z.array(
      z
        .object({
          id: z.number(),
          discordMessageId: z.string().nullable(),
          discordGuildId: z.string().nullable(),
          discordChannelId: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const discordHistoryOutput = page(discordHistoryItem);
