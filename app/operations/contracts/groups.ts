import { z } from "zod";
import { text, nullableText, nullableUrl, imageInput, updateContract } from "../fields";
export const groupFields = {
  name: text("name", 300),
  description: text("description"),
  website: nullableUrl().optional(),
  meetingFrequency: nullableText(500).optional(),
  visible: z.boolean().optional(),
  logo: imageInput.optional(),
  coverImage: imageInput.optional(),
};
export const groupCreateInput = z.object(groupFields).strict();
export const groupUpdateInput = updateContract(z.object(groupFields).partial().shape);

export const groupOutput = z
  .object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    website: z.string().nullable(),
    meetingFrequency: z.string().nullable(),
    logo: z.string().nullable(),
    coverImage: z.string().nullable(),
    visible: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
