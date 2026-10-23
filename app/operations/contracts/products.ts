import { createOptions } from "../fields";
import { z } from "zod";
import { text, nullableUrl, imageInput, updateContract, id, productTypes } from "../fields";
export const productFields = {
  name: text("name", 300),
  description: text("description"),
  type: z.enum(productTypes),
  website: nullableUrl().optional(),
  companyId: id().nullable().optional(),
  logo: imageInput.optional(),
  coverImage: imageInput.optional(),
};
export const productCreateInput = z
  .object(productFields)
  .extend({ type: productFields.type.default("other") })
  .strict()
  .safeExtend(createOptions);
export const productUpdateInput = updateContract(z.object(productFields).partial().shape);

export const productOutput = z
  .object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    website: z.string().nullable(),
    companyId: z.number().nullable(),
    type: z.enum(productTypes),
    logo: z.string().nullable(),
    coverImage: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
