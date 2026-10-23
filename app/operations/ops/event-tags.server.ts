import { listInput, page, collectionPage } from "../listing";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { emptyInput, deleteInput } from "../fields";
import { eventTagSaveInput, eventTagOutput } from "../contracts/events";
import {
  getEventTagsWithUsage,
  getEventTags,
  createEventTag,
  updateEventTag,
  deleteEventTag,
} from "~/lib/event-tags.server";
export const eventTagOperations = {
  eventTagList: defineOperation({
    name: "eventTagList",
    area: "events",
    risk: "read",
    access: "admin",
    summary: "List event tags and usage counts.",
    description:
      "Return available tag names, slugs, palette colors, and the number of assigned events.",
    input: listInput(["createdAt", "name"]),
    output: page(eventTagOutput.extend({ eventCount: z.number() }).strict()),
    examples: [{ title: "All tags", input: {} }],
    run: async (_ctx, input) =>
      toPlain(
        collectionPage(await getEventTagsWithUsage(), input, {
          createdAt: (row) => row.createdAt,
          name: (row) => row.name,
        }),
      ),
  }),
  eventTagSave: defineOperation({
    name: "eventTagSave",
    area: "events",
    risk: "write",
    access: "admin",
    summary: "Create or rename an event tag.",
    description:
      "Omit id to create; supply id to update. Derive the slug from name and reject duplicate names. Existing event assignments are preserved.",
    input: eventTagSaveInput,
    output: eventTagOutput,
    examples: [{ title: "Create a tag", input: { name: "Workshop", color: "harbour" } }],
    run: async (_ctx, input) => {
      if (!input.id) return toPlain(await createEventTag(input.name, input.color));
      if (!(await getEventTags()).some((row) => row.id === input.id))
        throw new NotFoundError("Tag not found");
      await updateEventTag(input.id, input.name, input.color);
      return toPlain((await getEventTags()).find((row) => row.id === input.id)!);
    },
  }),
  eventTagDelete: defineOperation({
    name: "eventTagDelete",
    area: "events",
    risk: "destructive",
    access: "admin",
    summary: "Delete an event tag.",
    description:
      "Remove the tag and all its assignments without deleting events. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true) }).strict(),
    examples: [{ title: "Delete a tag", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => {
      if (!(await getEventTags()).some((row) => row.id === id))
        throw new NotFoundError("Tag not found");
      await deleteEventTag(id);
      return { deleted: true as const };
    },
  }),
};
