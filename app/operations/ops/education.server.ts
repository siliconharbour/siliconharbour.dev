import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { lookupInput, deleteInput, adminListInput } from "../fields";
import { educationCreateInput, educationUpdateInput } from "../contracts/education";
import { educationOutput } from "../contracts/education";
import {
  createEducation,
  updateEducation,
  deleteEducation,
  getEducationById,
  getAllEducation,
} from "~/lib/education.server";
import { withEntityImages } from "~/lib/entity-images.server";

export const educationOperations = {
  educationList: defineOperation({
    name: "educationList",
    area: "education",
    risk: "read",
    access: "admin",
    summary: "List education for administration.",
    description:
      "Return a bounded page including hidden records. Filter by query or visibility. Use educationGet for one record.",
    input: adminListInput,
    output: z.array(educationOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_context, input) => {
      const records = await getAllEducation(true);
      return toPlain(
        records
          .filter(
            (record) =>
              (!input.query || record.name.toLowerCase().includes(input.query.toLowerCase())) &&
              (input.visible === undefined || record.visible === input.visible),
          )
          .slice(input.offset, input.offset + input.limit),
      );
    },
  }),
  educationGet: defineOperation({
    name: "educationGet",
    area: "education",
    risk: "read",
    access: "admin",
    summary: "Get one education.",
    description:
      "Return the stored record including hidden fields for administration. Throws when the record does not exist.",
    input: lookupInput,
    output: educationOutput,
    examples: [{ title: "By ID", input: { id: 1 } }],
    run: async (_context, input) => {
      const record =
        input.id !== undefined
          ? await getEducationById(input.id)
          : (await getAllEducation(true)).find((item) =>
              input.slug !== undefined
                ? item.slug === input.slug
                : item.name.toLowerCase() === input.name?.toLowerCase(),
            );
      if (!record) throw new NotFoundError("Education not found");
      return toPlain(record);
    },
  }),
  educationCreate: defineOperation({
    name: "educationCreate",
    area: "education",
    risk: "write",
    access: "admin",
    summary: "Create a education.",
    description:
      "Create the record through the shared service, derive its slug, and synchronize references. Optional images support upload, public URL, data URL, keep, or clear. New records default to hidden until approved.",
    input: educationCreateInput,
    output: educationOutput,
    examples: [{ title: "Create", input: { name: "Education", description: "Description" } }],
    run: async (_context, input) => {
      const { logo, coverImage, ...fields } = input;

      const result = await withEntityImages(
        { type: "education" },
        { icon: logo, cover: coverImage },
        async (images) => {
          const record = await createEducation({
            ...fields,
            visible: fields.visible ?? false,
            ...images,
          });

          return record;
        },
      );
      return toPlain(result);
    },
  }),
  educationUpdate: defineOperation({
    name: "educationUpdate",
    area: "education",
    risk: "write",
    access: "admin",
    summary: "Update a education.",
    description:
      "Patch only supplied fields; empty patches and unknown keys fail. Renaming regenerates the slug and text changes synchronize references. Replaced or cleared images are removed only when unreferenced.",
    input: educationUpdateInput,
    output: educationOutput,
    examples: [{ title: "Rename", input: { id: 1, name: "Updated Education" } }],
    run: async (_context, input) => {
      const { id, logo, coverImage, ...fields } = input;
      if (!(await getEducationById(id))) throw new NotFoundError("Education not found");
      const result = await withEntityImages(
        { type: "education", id },
        { icon: logo, cover: coverImage },
        async (images) => {
          const record = (await updateEducation(id, { ...fields, ...images }))!;

          return record;
        },
      );
      return toPlain(result);
    },
  }),
  educationDelete: defineOperation({
    name: "educationDelete",
    area: "education",
    risk: "destructive",
    access: "admin",
    summary: "Delete a education.",
    description:
      "Delete the record and clean up unreferenced images. Requires confirm: true. Returns the deleted record for review history.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true), record: educationOutput }).strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: async (_context, input) => {
      const record = await getEducationById(input.id);
      if (!record) throw new NotFoundError("Education not found");
      await deleteEducation(input.id);
      return { deleted: true as const, record: toPlain(record) };
    },
  }),
};
