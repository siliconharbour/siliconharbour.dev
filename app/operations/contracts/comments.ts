import { listInput, page } from "../listing";
import { z } from "zod";
import { contentTypes } from "../fields";
export const commentOutput = z
  .object({
    id: z.number(),
    contentType: z.enum(contentTypes),
    contentId: z.number(),
    parentId: z.number().nullable(),
    authorName: z.string().nullable(),
    content: z.string(),
    isPrivate: z.boolean(),
    ipAddress: z.string().nullable(),
    ipHash: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const commentListInput = listInput(["createdAt", "authorName"])
  .extend({
    contentType: z.enum(contentTypes).optional(),
    contentId: z.number().int().positive().optional(),
    createdAfter: z.iso.datetime().optional(),
    createdBefore: z.iso.datetime().optional(),
  })
  .strict();
export const commentListOutput = page(commentOutput);
