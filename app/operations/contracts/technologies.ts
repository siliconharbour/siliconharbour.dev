import { createOptions } from "../fields";
import { z } from "zod";
import {
  text,
  nullableText,
  nullableUrl,
  imageInput,
  updateContract,
  technologyCategories,
} from "../fields";
export const technologyFields = {
  name: text("name", 300),
  category: z.enum(technologyCategories),
  description: nullableText().optional(),
  website: nullableUrl().optional(),
  icon: imageInput.optional(),
  visible: z.boolean().optional(),
};
export const technologyCreateInput = z.object(technologyFields).strict().safeExtend(createOptions);
export const technologyUpdateInput = updateContract(z.object(technologyFields).partial().shape);

export const technologyOutput = z
  .object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
    category: z.enum(technologyCategories),
    description: z.string().nullable(),
    website: z.string().nullable(),
    icon: z.string().nullable(),
    visible: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
