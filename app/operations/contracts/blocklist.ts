import { z } from "zod";

export const blocklistItemOutput = z
  .object({
    id: z.number(),
    source: z.string(),
    externalId: z.string(),
    name: z.string(),
    reason: z.string().nullable(),
    blockedAt: z.iso.datetime(),
  })
  .strict();
import { text, nullableText, confirm, pagination } from "../fields";
export const blocklistSource = z.enum(["github", "technl", "genesis", "bounce"]);
export const blocklistListInput = z
  .object({ ...pagination, source: blocklistSource.optional() })
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
