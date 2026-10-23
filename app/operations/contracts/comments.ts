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
export const commentListInput = z
  .object({
    page: z.number().int().min(1).default(1),
    perPage: z.number().int().min(1).max(200).default(20),
  })
  .strict();
export const commentListOutput = z
  .object({ comments: z.array(commentOutput), total: z.number(), totalPages: z.number() })
  .strict();
