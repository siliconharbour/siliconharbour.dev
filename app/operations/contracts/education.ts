import { z } from "zod";
import { text, nullableUrl, imageInput, updateContract, educationTypes } from "../fields";
export const educationFields = {
  name: text("name", 300),
  description: text("description"),
  type: z.enum(educationTypes),
  website: nullableUrl().optional(),
  technl: z.boolean().optional(),
  genesis: z.boolean().optional(),
  bounce: z.boolean().optional(),
  visible: z.boolean().optional(),
  logo: imageInput.optional(),
  coverImage: imageInput.optional(),
};
export const educationCreateInput = z
  .object(educationFields)
  .extend({ type: educationFields.type.default("other") })
  .strict();
export const educationUpdateInput = updateContract(z.object(educationFields).partial().shape);

export const educationOutput = z
  .object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    website: z.string().nullable(),
    type: z.enum(educationTypes),
    logo: z.string().nullable(),
    coverImage: z.string().nullable(),
    technl: z.boolean().nullable(),
    genesis: z.boolean().nullable(),
    bounce: z.boolean().nullable(),
    visible: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
