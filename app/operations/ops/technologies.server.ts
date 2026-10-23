import { createIfAbsent, recordIdentity } from "../creation.server";
import { generateSlug } from "~/lib/slug";
import { directoryListInputs } from "../contracts/directory-lists";
import { page } from "../listing";
import { listTechnologies } from "~/lib/directory-lists.server";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { lookupInput, deleteInput } from "../fields";
import { technologyCreateInput, technologyUpdateInput } from "../contracts/technologies";
import { technologyOutput } from "../contracts/technologies";
import {
  createTechnology,
  updateTechnology,
  deleteTechnology,
  getTechnologyById,
  getAllTechnologies,
  getCompaniesUsingTechnology,
  getProjectsUsingTechnology,
} from "~/lib/technologies.server";
import { withEntityImages } from "~/lib/entity-images.server";

export const technologyOperations = {
  technologyList: defineOperation({
    name: "technologyList",
    area: "technologies",
    risk: "read",
    access: "admin",
    summary: "List technologies for administration.",
    description:
      "Return a bounded page including hidden records. Filter by query or visibility. Use technologyGet for one record.",
    input: directoryListInputs.technology,
    output: page(technologyOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listTechnologies(input)),
  }),
  technologyGet: defineOperation({
    name: "technologyGet",
    area: "technologies",
    risk: "read",
    access: "admin",
    summary: "Get one technology.",
    description:
      "Return the stored record including hidden fields for administration. Throws when the record does not exist.",
    input: lookupInput,
    output: technologyOutput
      .extend({
        companiesUsing: z.array(
          z
            .object({
              id: z.number(),
              slug: z.string(),
              name: z.string(),
              logo: z.string().nullable(),
            })
            .strict(),
        ),
        projectsUsing: z.array(
          z
            .object({
              id: z.number(),
              slug: z.string(),
              name: z.string(),
              logo: z.string().nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
    examples: [{ title: "By ID", input: { id: 1 } }],
    run: async (_context, input) => {
      const record =
        input.id !== undefined
          ? await getTechnologyById(input.id)
          : (await getAllTechnologies(true)).find((item) =>
              input.slug !== undefined
                ? item.slug === input.slug
                : item.name.toLowerCase() === input.name?.toLowerCase(),
            );
      if (!record) throw new NotFoundError("Technology not found");
      return toPlain({
        ...record,
        companiesUsing: await getCompaniesUsingTechnology(record.id),
        projectsUsing: await getProjectsUsingTechnology(record.id),
      });
    },
  }),
  technologyCreate: defineOperation({
    name: "technologyCreate",
    area: "technologies",
    risk: "write",
    access: "admin",
    summary: "Create a technology.",
    description:
      "Create the record through the shared service, derive its slug, and synchronize references. Optional images support upload, public URL, data URL, keep, or clear. New records default to hidden until approved. Set ifNotExists to return an existing record by the catalog slug derived from the technology name. Existing records are unchanged and return created:false; new records return created:true.",
    input: technologyCreateInput,
    output: technologyOutput.extend({ created: z.boolean() }).strict(),
    examples: [
      {
        title: "Create",
        input: { name: "Technology", description: "Description", category: "language" },
      },
    ],
    run: (_context, { ifNotExists, ...input }) =>
      createIfAbsent(
        "technology",
        ifNotExists,
        recordIdentity(
          generateSlug(input.name),
          () => getAllTechnologies(true),
          (row) => row.slug === generateSlug(input.name),
        ),
        async () => {
          const { icon, ...fields } = input;
          const result = await withEntityImages(
            { type: "technology" },
            { icon: icon },
            async (images) => {
              const record = await createTechnology({
                ...fields,
                visible: fields.visible ?? false,
                ...images,
              });

              return record;
            },
          );
          return toPlain(result);
        },
      ),
  }),
  technologyUpdate: defineOperation({
    name: "technologyUpdate",
    area: "technologies",
    risk: "write",
    access: "admin",
    summary: "Update a technology.",
    description:
      "Patch only supplied fields; empty patches and unknown keys fail. Renaming regenerates the slug and text changes synchronize references. Replaced or cleared images are removed only when unreferenced.",
    input: technologyUpdateInput,
    output: technologyOutput,
    examples: [{ title: "Rename", input: { id: 1, name: "Updated Technology" } }],
    run: async (_context, input) => {
      const { id, icon, ...fields } = input;
      if (!(await getTechnologyById(id))) throw new NotFoundError("Technology not found");
      const result = await withEntityImages(
        { type: "technology", id },
        { icon: icon },
        async (images) => {
          const record = (await updateTechnology(id, { ...fields, ...images }))!;

          return record;
        },
      );
      return toPlain(result);
    },
  }),
  technologyDelete: defineOperation({
    name: "technologyDelete",
    area: "technologies",
    risk: "destructive",
    access: "admin",
    summary: "Delete a technology.",
    description:
      "Delete the record and clean up unreferenced images. Requires confirm: true. Returns the deleted record for review history.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true), record: technologyOutput }).strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: async (_context, input) => {
      const record = await getTechnologyById(input.id);
      if (!record) throw new NotFoundError("Technology not found");
      await deleteTechnology(input.id);
      return { deleted: true as const, record: toPlain(record) };
    },
  }),
};
