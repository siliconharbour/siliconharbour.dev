import { z } from "zod";
import { id, workplaceTypes, dateTime } from "../fields";
export const publicListInput = z
  .object({
    limit: z.number().int().min(1).max(200).default(20),
    offset: z.number().int().min(0).default(0),
    query: z.string().trim().max(500).optional(),
  })
  .strict();
export const publicEventListInput = publicListInput
  .extend({ upcoming: z.boolean().default(true) })
  .strict();
export const publicJobListInput = publicListInput
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
