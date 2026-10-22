import { z } from "zod";
import { confirm, identifier, pagination } from "../fields";

export const themeShareListInput = z.object(pagination).strict();
export const themeShareDeleteInput = z.object({ id: identifier, confirm }).strict();
export const themeShareListOutput = z
  .object({
    items: z.array(
      z
        .object({
          id: identifier,
          name: z.string(),
          revision: z.number(),
          logoBytes: z.number(),
          createdAt: z.number(),
          updatedAt: z.number(),
          createdIp: z.string(),
          updatedIp: z.string(),
        })
        .strict(),
    ),
    total: z.number(),
  })
  .strict();
export const themeShareDeleteOutput = z.object({ deleted: z.boolean() }).strict();
