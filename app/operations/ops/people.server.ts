import {
  createIfAbsent,
  urlIdentity,
  normalizeDirectoryIdentity,
  normalizeGithubIdentity,
} from "../creation.server";
import { directoryListInputs } from "../contracts/directory-lists";
import { page } from "../listing";
import { listPeople } from "~/lib/directory-lists.server";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { lookupInput } from "../fields";
import { personCreateInput, personUpdateInput } from "../contracts/people";
import { personOutput } from "../contracts/people";
import { createPerson, updatePerson, getPersonById, getAllPeople } from "~/lib/people.server";
import { withEntityImages } from "~/lib/entity-images.server";

export const personOperations = {
  personList: defineOperation({
    name: "personList",
    area: "people",
    risk: "read",
    access: "admin",
    summary: "List people for administration.",
    description:
      "Return a bounded page including hidden records. Filter by query or visibility. Use personGet for one record.",
    input: directoryListInputs.person,
    output: page(personOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listPeople(input)),
  }),
  personGet: defineOperation({
    name: "personGet",
    area: "people",
    risk: "read",
    access: "admin",
    summary: "Get one person.",
    description:
      "Return the stored record including hidden fields for administration. Throws when the record does not exist.",
    input: lookupInput,
    output: personOutput,
    examples: [{ title: "By ID", input: { id: 1 } }],
    run: async (_context, input) => {
      const record =
        input.id !== undefined
          ? await getPersonById(input.id)
          : (await getAllPeople(true)).find((item) =>
              input.slug !== undefined
                ? item.slug === input.slug
                : item.name.toLowerCase() === input.name?.toLowerCase(),
            );
      if (!record) throw new NotFoundError("Person not found");
      return toPlain(record);
    },
  }),
  personCreate: defineOperation({
    name: "personCreate",
    area: "people",
    risk: "write",
    access: "admin",
    summary: "Create a person.",
    description:
      "Create the record through the shared service, derive its slug, and synchronize references. Optional images support upload, public URL, data URL, keep, or clear. New records default to hidden until approved. Set ifNotExists to return an existing record by GitHub profile, or website when no GitHub profile is supplied. Existing records are unchanged and return created:false; new records return created:true.",
    input: personCreateInput,
    output: personOutput.extend({ created: z.boolean() }).strict(),
    examples: [{ title: "Create", input: { name: "Person", bio: "Description" } }],
    run: (_context, { ifNotExists, ...input }) =>
      createIfAbsent(
        "person",
        ifNotExists,
        urlIdentity(
          input.externalLinks?.github ?? input.website,
          () => getAllPeople(true),
          (row) => (input.externalLinks?.github ? row.externalLinks?.github : row.website),
          input.externalLinks?.github ? normalizeGithubIdentity : normalizeDirectoryIdentity,
        ),
        async () => {
          const { avatar, externalLinks, ...fields } = input;
          const result = await withEntityImages({ type: "person" }, { icon: avatar }, (images) =>
            createPerson({
              externalLinks,
              ...fields,
              visible: fields.visible ?? false,
              ...images,
            }),
          );
          return toPlain(result);
        },
      ),
  }),
  personUpdate: defineOperation({
    name: "personUpdate",
    area: "people",
    risk: "write",
    access: "admin",
    summary: "Update a person.",
    description:
      "Patch only supplied fields; empty patches and unknown keys fail. externalLinks merges supplied keys; a null key removes that link, and a null object clears all links. Renaming regenerates the slug and text changes synchronize references. Replaced or cleared images are removed only when unreferenced.",
    input: personUpdateInput,
    output: personOutput,
    examples: [{ title: "Rename", input: { id: 1, name: "Updated Person" } }],
    run: async (_context, input) => {
      const { id, avatar, externalLinks, ...fields } = input;
      if (!(await getPersonById(id))) throw new NotFoundError("Person not found");
      const result = await withEntityImages(
        { type: "person", id },
        { icon: avatar },
        async (images) => {
          const record = (await updatePerson(id, {
            externalLinks,
            ...fields,
            ...images,
          }))!;

          return record;
        },
      );
      return toPlain(result);
    },
  }),
};
