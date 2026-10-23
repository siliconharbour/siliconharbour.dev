import { listInput } from "../listing";
import { z } from "zod";

export const blocklistItemOutput = z
  .object({
    id: z.number(),
    source: z.string(),
    key: z.string(),
    name: z.string(),
    reason: z.string().nullable(),
    blockedAt: z.iso.datetime(),
  })
  .strict();
import { text, nullableText, confirm, updateContract } from "../fields";
export const blocklistSource = z.enum(["github", "technl", "genesis", "bounce"]);
export const blocklistListInput = listInput(["blockedAt", "name", "key"])
  .extend({ source: blocklistSource.optional() })
  .strict();
export const blocklistAddInput = z
  .object({
    source: blocklistSource,
    externalId: text("externalId", 4096),
    name: text("name", 500),
    reason: nullableText(2000).optional(),
    deleteExisting: z.boolean().default(false),
    confirm,
  })
  .strict();
export const blocklistRemoveInput = z
  .object({ source: blocklistSource, externalId: text("externalId", 4096) })
  .strict();

export const blocklistReason = nullableText(2000)
  .describe("Reason for blocking this identity. Omit to use the review action's default.")
  .optional();
export const blocklistUpdateInput = updateContract({
  name: text("name", 500).optional(),
  reason: nullableText(2000).optional(),
});
