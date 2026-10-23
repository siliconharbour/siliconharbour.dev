import { listInput } from "../listing";
import { z } from "zod";
import { id, workplaceTypes, dateTime } from "../fields";
export const publicListInput = listInput(["createdAt", "updatedAt", "name"]);
export const publicEventListInput = listInput(["startDate"])
  .extend({ order: z.literal("asc").default("asc"), upcoming: z.boolean().default(true) })
  .strict();
export const publicJobListInput = listInput(["createdAt", "postedAt", "title", "lastSeenAt"])
  .extend({
    companyId: id().optional(),
    sourceId: id().optional(),
    status: z
      .literal("active")
      .optional()
      .describe("Only active jobs are public; administrators use jobList for other statuses."),
    isTechnical: z.boolean().optional(),
    workplaceType: z.enum(workplaceTypes).optional(),
    location: z.string().trim().max(500).optional(),
    lastSeenAfter: dateTime.optional(),
  })
  .strict();
export const newsPublicListInput = listInput(["createdAt", "updatedAt", "title", "publishedAt"]);
