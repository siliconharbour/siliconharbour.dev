import { z } from "zod";
import { sectionKeys, commentableKeys, confirm, nullableText } from "../fields";
const sectionFields = {
  events: z.boolean(),
  companies: z.boolean(),
  groups: z.boolean(),
  projects: z.boolean(),
  products: z.boolean(),
  education: z.boolean(),
  people: z.boolean(),
  news: z.boolean(),
  jobs: z.boolean(),
} satisfies Record<(typeof sectionKeys)[number], z.ZodBoolean>;
const commentFields = {
  companies: z.boolean(),
  groups: z.boolean(),
  education: z.boolean(),
  projects: z.boolean(),
  products: z.boolean(),
  news: z.boolean(),
} satisfies Record<(typeof commentableKeys)[number], z.ZodBoolean>;
export const sectionVisibility = z.object(sectionFields).strict();
export const commentVisibility = z.object(commentFields).strict();
export const sectionVisibilityInput = z
  .object({
    values: sectionVisibility
      .partial()
      .refine((values) => Object.keys(values).length > 0, "No fields to update"),
    confirm,
  })
  .strict();
export const commentVisibilityInput = z
  .object({
    values: commentVisibility
      .partial()
      .refine((values) => Object.keys(values).length > 0, "No fields to update"),
    confirm,
  })
  .strict();
export const discordConfigOutput = z
  .object({ botTokenConfigured: z.boolean(), botTokenMasked: z.string() })
  .strict();
export const discordConfigSetInput = z
  .object({
    botToken: nullableText(500).describe(
      "New bot token, or null to clear it. Reads return a mask only.",
    ),
  })
  .strict();
export const siteConfigOutput = z
  .object({
    sections: sectionVisibility,
    comments: commentVisibility,
    newsGlobalKeywords: z.string(),
    discord: discordConfigOutput,
  })
  .strict();
export const siteConfigSaveInput = z
  .object({
    sections: sectionVisibility,
    comments: commentVisibility,
    newsGlobalKeywords: nullableText(10000),
    botToken: nullableText(500).optional(),
    confirm,
  })
  .strict();
