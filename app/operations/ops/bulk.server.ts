import { defineOperation, type Operation } from "../define";
import {
  bulkIdsInput,
  bulkConfirmedIdsInput,
  bulkIdResults,
  blocklistAddManyInput,
  blocklistAddManyOutput,
} from "../contracts/bulk";
import { jobStatusOperations } from "./job-status.server";
import { newsStatusOperations } from "./news-status.server";
import { eventOperations } from "./events.server";
import { blocklistOperations } from "./blocklist.server";
import { normalizeBlockKey } from "~/lib/import-blocklist-key";

function moderationBatch(
  name: string,
  single: Operation,
  summary: string,
  risk: "write" | "destructive",
) {
  return defineOperation<typeof bulkIdsInput | typeof bulkConfirmedIdsInput, typeof bulkIdResults>({
    name,
    area: single.area,
    access: "admin",
    risk,
    summary,
    description: `${single.description} Apply to at most 200 distinct IDs in input order, using the same single-record operation. Return a result for each ID and continue after failures.${risk === "destructive" ? " Requires confirm: true." : ""}`,
    input: risk === "destructive" ? bulkConfirmedIdsInput : bulkIdsInput,
    output: bulkIdResults,
    examples: [
      {
        title: summary,
        input: risk === "destructive" ? { ids: [1], confirm: true as const } : { ids: [1] },
      },
    ],
    run: async (ctx, input) => {
      const results = [];
      for (const id of input.ids) {
        try {
          await single.execute(ctx, { id });
          results.push({ id, ok: true as const });
        } catch (error) {
          results.push({
            id,
            ok: false as const,
            error: error instanceof Error ? error.message : "Operation failed",
          });
        }
      }
      return results;
    },
  });
}
export const bulkOperations = {
  jobBulkApprove: moderationBatch(
    "jobBulkApprove",
    jobStatusOperations.jobApprove,
    "Approve selected jobs.",
    "write",
  ),
  jobBulkHide: moderationBatch(
    "jobBulkHide",
    jobStatusOperations.jobHide,
    "Hide selected jobs.",
    "destructive",
  ),
  newsBulkApprove: moderationBatch(
    "newsBulkApprove",
    newsStatusOperations.newsApprove,
    "Approve selected news.",
    "write",
  ),
  newsBulkHide: moderationBatch(
    "newsBulkHide",
    newsStatusOperations.newsHide,
    "Hide selected news.",
    "destructive",
  ),
  eventImportBulkApprove: moderationBatch(
    "eventImportBulkApprove",
    eventOperations.eventImportApprove,
    "Approve selected imported events.",
    "write",
  ),
  eventImportBulkHide: moderationBatch(
    "eventImportBulkHide",
    eventOperations.eventImportHide,
    "Hide selected events.",
    "destructive",
  ),
  blocklistAddMany: defineOperation({
    name: "blocklistAddMany",
    area: "blocklist",
    access: "admin",
    risk: "destructive",
    summary: "Block selected import identities.",
    description:
      "Apply blocklistAdd to at most 200 items in input order. Each item normalizes its key, preserves existing block metadata, and can explicitly delete existing matches. Return per-item results and continue after failures. Requires confirm: true.",
    input: blocklistAddManyInput,
    output: blocklistAddManyOutput,
    examples: [
      {
        title: "Block GitHub imports",
        input: {
          items: [{ source: "github", externalId: "example", name: "Example" }],
          confirm: true,
        },
      },
    ],
    run: async (ctx, input) => {
      const results = [];
      for (const item of input.items) {
        const key = normalizeBlockKey(item.source, item.externalId);
        try {
          const result = await blocklistOperations.blocklistAdd.execute(ctx, {
            ...item,
            confirm: true,
          });
          results.push({
            source: item.source,
            key: result.key,
            ok: true as const,
            deletedIds: result.deletedIds,
          });
        } catch (error) {
          results.push({
            source: item.source,
            key,
            ok: false as const,
            error: error instanceof Error ? error.message : "Operation failed",
          });
        }
      }
      return results;
    },
  }),
};
