import { listInput } from "../listing";
import { email } from "../fields";
import { z } from "zod";
import { text, nullableText, id, confirm } from "../fields";
export const newsletterFlags = z
  .object({ publicSignup: z.boolean(), liveSend: z.boolean() })
  .strict();
export const campaignAudience = z
  .union([z.object({ testSubscriberIds: z.array(id()) }).strict(), z.array(id())])
  .nullable();
export const campaignOutput = z
  .object({
    id: z.number(),
    subject: z.string(),
    bodyMarkdown: z.string(),
    fromAddress: z.string(),
    fromName: z.string().nullable(),
    audienceType: z.enum(["list", "tag", "all", "subscribers"]),
    audienceId: z.number().nullable(),
    audienceData: campaignAudience,
    status: z.enum(["draft", "scheduled", "sending", "sent", "failed"]),
    createdAt: z.iso.datetime(),
    sentAt: z.iso.datetime().nullable(),
    lastError: z.string().nullable(),
    deliveryCounts: z.record(z.string(), z.number()).optional(),
  })
  .strict();
export const subscriberOutput = z
  .object({
    id: z.number(),
    email: z.string(),
    createdAt: z.iso.datetime(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    status: z.enum(["active", "blocklisted"]),
    membershipStatus: z.enum(["unconfirmed", "confirmed", "unsubscribed"]).nullable(),
  })
  .strict();
export const campaignSendOutput = z
  .object({
    id: z.number(),
    subscriberId: z.number(),
    email: z.string().nullable(),
    status: z.string(),
    attemptCount: z.number(),
    acceptedAt: z.iso.datetime().nullable(),
    deliveredAt: z.iso.datetime().nullable(),
    lastError: z.string().nullable(),
  })
  .strict();
export const campaignInput = z
  .object({ subject: text("subject", 255), bodyMarkdown: text("bodyMarkdown", 1_000_000) })
  .strict();
export const campaignSaveInput = campaignInput.extend({ id: id() }).strict();
export const campaignGetInput = z
  .object({ id: id(), offset: z.number().int().min(0).default(0) })
  .strict();
export const campaignGetOutput = z
  .object({
    campaign: campaignOutput,
    preview: z
      .object({ subject: z.string(), html: z.string().nullable(), text: z.string() })
      .strict(),
    flags: newsletterFlags,
    pilotCount: z.number(),
    sends: z.array(campaignSendOutput),
  })
  .strict();
export const subscriberListInput = listInput(["createdAt"])
  .extend({
    query: z.string().trim().max(255).optional(),
    order: z.literal("desc").default("desc"),
  })
  .strict();
export const subscriberCreateInput = z
  .object({
    email: email(),
    firstName: nullableText(255).optional(),
    lastName: nullableText(255).optional(),
    confirm,
  })
  .strict();
export const subscriberResendInput = z.object({ email: email(), confirm }).strict();
