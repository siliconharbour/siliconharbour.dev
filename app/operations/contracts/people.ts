import { blocklistReason } from "./blocklist";
import { createOptions } from "../fields";
import { nullableGithubProfile } from "../fields";
import { socialLinksOutput } from "~/lib/links";
import { z } from "zod";
import {
  text,
  nullableText,
  nullableUrl,
  socialLinks,
  imageInput,
  updateContract,
  id,
  confirm,
} from "../fields";
export const personFields = {
  name: text("name", 300),
  bio: nullableText().describe("Markdown bio. Null or blank clears it."),
  website: nullableUrl().optional(),
  github: nullableGithubProfile().optional(),
  socialLinks: socialLinks.optional(),
  avatar: imageInput.optional(),
  visible: z.boolean().optional(),
};
export const personCreateInput = z
  .object({ ...personFields, bio: personFields.bio.default(null) })
  .strict()
  .safeExtend(createOptions);
export const personUpdateInput = updateContract(z.object(personFields).partial().shape);
export const personDeleteInput = z
  .object({
    id: id(),
    confirm,
    block: z
      .object({ source: z.literal("github"), reason: blocklistReason })
      .strict()
      .optional(),
  })
  .strict();
export const personBulkRejectInput = z
  .object({ pattern: text("pattern", 500), reason: blocklistReason, confirm })
  .strict();

export const personOutput = z
  .object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
    bio: z.string().nullable(),
    website: z.string().nullable(),
    github: z.string().nullable(),
    avatar: z.string().nullable(),
    socialLinks: socialLinksOutput,
    visible: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
