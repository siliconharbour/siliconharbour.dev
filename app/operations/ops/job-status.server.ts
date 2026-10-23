import { z } from "zod";
import { defineOperation } from "../define";
import { toPlain } from "../plain";
import { idInput, confirm } from "../fields";
import { jobOutput, jobDeactivateInput } from "../contracts/jobs";
import { requireJob } from "./jobs.server";
import { deactivateJob } from "~/lib/jobs.server";
import {
  approveJob,
  approveJobAsNonTechnical,
  hideImportedJob,
  unhideImportedJob,
  requeueImportedJob,
  markJobTechnical,
  markJobNonTechnical,
  hideAllPendingJobs,
} from "~/lib/job-importers/sync.server";
function statusOperation(
  name: string,
  summary: string,
  description: string,
  change: (id: number) => Promise<void>,
) {
  return defineOperation({
    name,
    area: "jobs",
    risk: "write",
    access: "admin",
    summary,
    description,
    input: idInput,
    output: jobOutput,
    examples: [{ title: summary, input: { id: 1 } }],
    run: async (_ctx, { id }) => {
      await requireJob(id);
      await change(id);
      return toPlain(await requireJob(id));
    },
  });
}
export const jobStatusOperations = {
  jobApprove: statusOperation(
    "jobApprove",
    "Approve a job as technical.",
    "Set status to active and isTechnical to true. Works for imported jobs without editing importer-owned fields.",
    approveJob,
  ),
  jobApproveNonTechnical: statusOperation(
    "jobApproveNonTechnical",
    "Approve a nontechnical job.",
    "Set status to active and isTechnical to false. Preserve the imported description and source.",
    approveJobAsNonTechnical,
  ),
  jobHide: statusOperation(
    "jobHide",
    "Hide a job.",
    "Set status to hidden. It remains stored and the importer will not reactivate it. Use jobUnhide to return it to review.",
    hideImportedJob,
  ),
  jobUnhide: statusOperation(
    "jobUnhide",
    "Return a hidden job to review.",
    "Set status to pending_review while preserving its technical classification.",
    unhideImportedJob,
  ),
  jobRequeue: statusOperation(
    "jobRequeue",
    "Requeue a job for review.",
    "Reset status to pending_review without deleting its data.",
    requeueImportedJob,
  ),
  jobMarkTechnical: statusOperation(
    "jobMarkTechnical",
    "Mark a job as technical.",
    "Set isTechnical to true without changing publication status. Use jobApprove to also activate it.",
    markJobTechnical,
  ),
  jobMarkNonTechnical: statusOperation(
    "jobMarkNonTechnical",
    "Mark a job as nontechnical.",
    "Set isTechnical to false without changing publication status.",
    markJobNonTechnical,
  ),
  jobDeactivate: defineOperation({
    name: "jobDeactivate",
    area: "jobs",
    risk: "write",
    access: "admin",
    summary: "Deactivate a job.",
    description:
      "Mark a job removed, filled, or expired and record removedAt. Works for manual and imported jobs; field edits remain guarded.",
    input: jobDeactivateInput,
    output: jobOutput,
    examples: [{ title: "Mark filled", input: { id: 1, reason: "filled" } }],
    run: async (_ctx, { id, reason }) => {
      await requireJob(id);
      return toPlain((await deactivateJob(id, reason))!);
    },
  }),
  jobHideAllPending: defineOperation({
    name: "jobHideAllPending",
    area: "jobs",
    risk: "destructive",
    access: "admin",
    summary: "Hide every pending job.",
    description:
      "Set all pending_review jobs to hidden. Keep records and source ownership. Requires confirm: true.",
    input: z.object({ confirm }).strict(),
    output: z.object({ hidden: z.number() }).strict(),
    examples: [{ title: "Hide pending", input: { confirm: true } }],
    run: async () => ({ hidden: await hideAllPendingJobs() }),
  }),
};
