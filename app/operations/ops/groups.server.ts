import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { lookupInput, deleteInput, adminListInput } from "../fields";
import { groupCreateInput, groupUpdateInput } from "../contracts/groups";
import { groupOutput } from "../contracts/groups";
import {
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupById,
  getAllGroups,
} from "~/lib/groups.server";
import { withEntityImages } from "~/lib/entity-images.server";

export const groupOperations = {
  groupList: defineOperation({
    name: "groupList",
    area: "groups",
    risk: "read",
    access: "admin",
    summary: "List groups for administration.",
    description:
      "Return a bounded page including hidden records. Filter by query or visibility. Use groupGet for one record.",
    input: adminListInput,
    output: z.array(groupOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_context, input) => {
      const records = await getAllGroups(true);
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
  groupGet: defineOperation({
    name: "groupGet",
    area: "groups",
    risk: "read",
    access: "admin",
    summary: "Get one group.",
    description:
      "Return the stored record including hidden fields for administration. Throws when the record does not exist.",
    input: lookupInput,
    output: groupOutput,
    examples: [{ title: "By ID", input: { id: 1 } }],
    run: async (_context, input) => {
      const record =
        input.id !== undefined
          ? await getGroupById(input.id)
          : (await getAllGroups(true)).find((item) =>
              input.slug !== undefined
                ? item.slug === input.slug
                : item.name.toLowerCase() === input.name?.toLowerCase(),
            );
      if (!record) throw new NotFoundError("Group not found");
      return toPlain(record);
    },
  }),
  groupCreate: defineOperation({
    name: "groupCreate",
    area: "groups",
    risk: "write",
    access: "admin",
    summary: "Create a group.",
    description:
      "Create the record through the shared service, derive its slug, and synchronize references. Optional images support upload, public URL, data URL, keep, or clear. New records default to hidden until approved.",
    input: groupCreateInput,
    output: groupOutput,
    examples: [{ title: "Create", input: { name: "Group", description: "Description" } }],
    run: async (_context, input) => {
      const { logo, coverImage, ...fields } = input;

      const result = await withEntityImages(
        { type: "group" },
        { icon: logo, cover: coverImage },
        async (images) => {
          const record = await createGroup({
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
  groupUpdate: defineOperation({
    name: "groupUpdate",
    area: "groups",
    risk: "write",
    access: "admin",
    summary: "Update a group.",
    description:
      "Patch only supplied fields; empty patches and unknown keys fail. Renaming regenerates the slug and text changes synchronize references. Replaced or cleared images are removed only when unreferenced.",
    input: groupUpdateInput,
    output: groupOutput,
    examples: [{ title: "Rename", input: { id: 1, name: "Updated Group" } }],
    run: async (_context, input) => {
      const { id, logo, coverImage, ...fields } = input;
      if (!(await getGroupById(id))) throw new NotFoundError("Group not found");
      const result = await withEntityImages(
        { type: "group", id },
        { icon: logo, cover: coverImage },
        async (images) => {
          const record = (await updateGroup(id, { ...fields, ...images }))!;

          return record;
        },
      );
      return toPlain(result);
    },
  }),
  groupDelete: defineOperation({
    name: "groupDelete",
    area: "groups",
    risk: "destructive",
    access: "admin",
    summary: "Delete a group.",
    description:
      "Delete the record and clean up unreferenced images. Requires confirm: true. Returns the deleted record for review history.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true), record: groupOutput }).strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: async (_context, input) => {
      const record = await getGroupById(input.id);
      if (!record) throw new NotFoundError("Group not found");
      await deleteGroup(input.id);
      return { deleted: true as const, record: toPlain(record) };
    },
  }),
};
