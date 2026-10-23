import { socialLinksOutput } from "~/lib/links";
import { z } from "zod";
import { text, nullableUrl, socialLinks, imageInput, updateContract, id, confirm } from "../fields";
export const personFields = {
  name: text("name", 300),
  bio: text("bio"),
  website: nullableUrl().optional(),
  github: nullableUrl().optional(),
  socialLinks: socialLinks.optional(),
  avatar: imageInput.optional(),
  visible: z.boolean().optional(),
};
export const personCreateInput = z.object(personFields).strict();
export const personUpdateInput = updateContract(z.object(personFields).partial().shape);
export const personDeleteInput = z
  .object({
    id: id(),
    confirm,
    block: z
      .object({ source: z.literal("github") })
      .strict()
      .optional(),
  })
  .strict();
export const personBulkRejectInput = z.object({ pattern: text("pattern", 500), confirm }).strict();

export const personOutput = z
  .object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
    bio: z.string(),
    website: z.string().nullable(),
    github: z.string().nullable(),
    avatar: z.string().nullable(),
    socialLinks: socialLinksOutput,
    visible: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
