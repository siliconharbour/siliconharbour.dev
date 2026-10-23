import { z } from "zod";
import { id, confirm } from "../fields";
import { blocklistAddInput, blocklistSource } from "./blocklist";
export const bulkIdsInput = z
  .object({
    ids: z
      .array(id())
      .min(1)
      .max(200)
      .transform((ids) => [...new Set(ids)]),
  })
  .strict();
export const bulkConfirmedIdsInput = bulkIdsInput.extend({ confirm }).strict();
export const bulkIdResults = z.array(
  z.discriminatedUnion("ok", [
    z.object({ id: id(), ok: z.literal(true) }).strict(),
    z.object({ id: id(), ok: z.literal(false), error: z.string() }).strict(),
  ]),
);
export const blocklistAddManyInput = z
  .object({
    items: z
      .array(blocklistAddInput.omit({ confirm: true }))
      .min(1)
      .max(200),
    confirm,
  })
  .strict();
export const blocklistAddManyOutput = z.array(
  z.discriminatedUnion("ok", [
    z
      .object({
        source: blocklistSource,
        key: z.string(),
        ok: z.literal(true),
        deletedIds: z.array(id()),
      })
      .strict(),
    z
      .object({ source: blocklistSource, key: z.string(), ok: z.literal(false), error: z.string() })
      .strict(),
  ]),
);
