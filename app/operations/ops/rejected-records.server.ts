import { z } from "zod";
import { defineOperation } from "../define";
import { deleteInput } from "../fields";
import { toPlain } from "../plain";
import { rejectedRecordListInput, rejectedRecordListOutput } from "../contracts/rejected-records";
import {
  listRejectedRecords,
  restoreRejectedRecord,
  deleteRejectedRecord,
} from "~/lib/rejected-records.server";
export const rejectedRecordOperations = {
  rejectedRecordList: defineOperation({
    name: "rejectedRecordList",
    area: "blocklist",
    risk: "read",
    access: "admin",
    summary: "List rejected directory records.",
    description:
      "List retained people and companies, including expired entries awaiting cleanup. Records stay hidden and outside normal directory and review reads. Restore within seven days, or permanently delete with rejectedRecordDelete.",
    input: rejectedRecordListInput,
    output: rejectedRecordListOutput,
    examples: [{ title: "Recent rejections", input: {} }],
    run: async (_ctx, input) => toPlain(await listRejectedRecords(input)),
  }),
  rejectedRecordRestore: defineOperation({
    name: "rejectedRecordRestore",
    area: "blocklist",
    risk: "destructive",
    access: "admin",
    summary: "Restore a rejected directory record.",
    description:
      "Restore within seven days using the server-held record, preserving its ID, slug, fields, images and relationships. Restore its previous visibility and remove its import block unless another retained rejection uses that key. Requires confirm: true. Expired entries return NotFound.",
    input: deleteInput,
    output: z
      .object({
        restored: z.literal(true),
        type: z.enum(["person", "company"]),
        id: z.number().int().positive(),
      })
      .strict(),
    examples: [{ title: "Restore rejection", input: { id: 1, confirm: true } }],
    run: (ctx, input) => restoreRejectedRecord(input.id, ctx.now()),
  }),
  rejectedRecordDelete: defineOperation({
    name: "rejectedRecordDelete",
    area: "blocklist",
    risk: "destructive",
    access: "admin",
    summary: "Permanently delete a rejected record.",
    description:
      "Delete a retained person or company and its dependent relationships, cleaning up unreferenced images. Its import block remains. This also cleans up expired entries. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true) }).strict(),
    examples: [{ title: "Delete rejected record", input: { id: 1, confirm: true } }],
    run: (_ctx, input) => deleteRejectedRecord(input.id),
  }),
};
