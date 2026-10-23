import { createOptions } from "../fields";
import { projectLinksOutput } from "~/lib/links";
import { z } from "zod";
import {
  text,
  projectLinks,
  imageInput,
  imageFileInput,
  updateContract,
  id,
  confirm,
  nullableText,
  projectTypes,
  projectStatuses,
} from "../fields";
export const projectFields = {
  name: text("name", 300),
  description: text("description"),
  type: z.enum(projectTypes),
  status: z.enum(projectStatuses),
  links: projectLinks.optional(),
  logo: imageInput.optional(),
  coverImage: imageInput.optional(),
  technologyIds: z.array(id()).max(500).optional(),
};
export const projectCreateInput = z
  .object(projectFields)
  .extend({
    type: projectFields.type.default("other"),
    status: projectFields.status.default("active"),
  })
  .strict()
  .safeExtend(createOptions);
export const projectUpdateInput = updateContract(z.object(projectFields).partial().shape);
export const projectGalleryAddInput = z
  .object({ id: id(), image: imageFileInput, caption: nullableText(2000).default(null) })
  .strict();
export const projectGalleryUpdateInput = z
  .object({ id: id(), imageId: id(), caption: nullableText(2000) })
  .strict();
export const projectGalleryReorderInput = z
  .object({
    id: id(),
    imageIds: z
      .array(id())
      .max(1000)
      .describe("Every gallery image ID exactly once, in the desired order."),
  })
  .strict();
export const projectGalleryRemoveInput = z.object({ id: id(), imageId: id(), confirm }).strict();

export const projectOutput = z
  .object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    links: projectLinksOutput,
    type: z.enum(projectTypes),
    status: z.enum(projectStatuses),
    logo: z.string().nullable(),
    coverImage: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
