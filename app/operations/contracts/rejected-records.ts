import { z } from "zod";
import { listInput, page } from "../listing";
export const rejectedRecordOutput = z
  .object({
    id: z.number().int().positive(),
    type: z.enum(["person", "company"]),
    entityId: z.number().int().positive(),
    name: z.string(),
    wasVisible: z.boolean(),
    blockSource: z.string().nullable(),
    blockKey: z.string().nullable(),
    rejectedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const rejectedRecordListInput = listInput(["rejectedAt", "expiresAt", "name"])
  .extend({ type: z.enum(["person", "company"]).optional() })
  .strict();
export const rejectedRecordListOutput = page(rejectedRecordOutput);
