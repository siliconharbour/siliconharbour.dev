import { listInput, page } from "../listing";
import { z } from "zod";
import { confirm, identifier } from "../fields";

export const themeShareListInput = listInput(["createdAt", "updatedAt", "name"]);
export const themeShareDeleteInput = z.object({ id: identifier, confirm }).strict();
export const themeShareItemOutput = z
  .object({
    id: identifier,
    name: z.string(),
    revision: z.number(),
    logoBytes: z.number(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    createdIp: z.string(),
    updatedIp: z.string(),
  })
  .strict();
export const themeShareDeleteOutput = z.object({ deleted: z.boolean() }).strict();

export const themeShareListOutput = page(themeShareItemOutput);
