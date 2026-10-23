import { listInput } from "../listing";
import { listReviewQueue } from "~/lib/review-queue.server";
import { defineOperation } from "../define";
import { emptyInput } from "../fields";
import { dashboardOutput, reviewQueueOutput } from "../contracts/dashboard";
import { getAdminDashboardCounts } from "~/lib/admin-dashboard.server";

import { toPlain } from "../plain";
export const dashboardOperations = {
  dashboardCounts: defineOperation({
    name: "dashboardCounts",
    area: "dashboard",
    risk: "read",
    access: "admin",
    summary: "Get admin dashboard counts.",
    description:
      "Return entity counts, pending-review totals, and failed import sources to guide moderation.",
    input: emptyInput,
    output: dashboardOutput,
    examples: [{ title: "Dashboard", input: {} }],
    run: async () => toPlain(await getAdminDashboardCounts()),
  }),
  reviewQueueList: defineOperation({
    name: "reviewQueueList",
    area: "dashboard",
    risk: "read",
    access: "admin",
    summary: "Get pending events, news, and jobs.",
    description:
      "Return the unified administrator review queue. Use the corresponding eventImportApprove, newsApprove, or jobApprove operation to review an item.",
    input: listInput(["createdAt", "title"]),
    output: reviewQueueOutput,
    examples: [{ title: "Review queue", input: {} }],
    run: async (_ctx, input) => toPlain(await listReviewQueue(input)),
  }),
};
