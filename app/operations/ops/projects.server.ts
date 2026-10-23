import { validateTechnologyIds } from "./directory-technologies.server";
import { technologyAssignmentOutput, projectImageOutput } from "../contracts/directory-relations";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { lookupInput, deleteInput, adminListInput } from "../fields";
import { projectCreateInput, projectUpdateInput } from "../contracts/projects";
import { projectOutput } from "../contracts/projects";
import {
  createProject,
  updateProject,
  deleteProject,
  getProjectById,
  getAllProjects,
  getProjectImages,
} from "~/lib/projects.server";
import { withEntityImages } from "~/lib/entity-images.server";
import { stringifyProjectLinks } from "~/lib/project-links";
import { setTechnologiesForContent, getTechnologiesForContent } from "~/lib/technologies.server";

export const projectOperations = {
  projectList: defineOperation({
    name: "projectList",
    area: "projects",
    risk: "read",
    access: "admin",
    summary: "List projects for administration.",
    description:
      "Return a bounded page including hidden records. Filter by query or visibility. Use projectGet for one record.",
    input: adminListInput,
    output: z.array(projectOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_context, input) => {
      const records = await getAllProjects();
      return toPlain(
        records
          .filter(
            (record) =>
              !input.query || record.name.toLowerCase().includes(input.query.toLowerCase()),
          )
          .slice(input.offset, input.offset + input.limit),
      );
    },
  }),
  projectGet: defineOperation({
    name: "projectGet",
    area: "projects",
    risk: "read",
    access: "admin",
    summary: "Get one project.",
    description:
      "Return the stored record including hidden fields for administration. Throws when the record does not exist.",
    input: lookupInput,
    output: projectOutput
      .extend({
        technologies: z.array(technologyAssignmentOutput),
        images: z.array(projectImageOutput),
      })
      .strict(),
    examples: [{ title: "By ID", input: { id: 1 } }],
    run: async (_context, input) => {
      const record =
        input.id !== undefined
          ? await getProjectById(input.id)
          : (await getAllProjects()).find((item) =>
              input.slug !== undefined
                ? item.slug === input.slug
                : item.name.toLowerCase() === input.name?.toLowerCase(),
            );
      if (!record) throw new NotFoundError("Project not found");
      return toPlain({
        ...record,
        technologies: await getTechnologiesForContent("project", record.id),
        images: await getProjectImages(record.id),
      });
    },
  }),
  projectCreate: defineOperation({
    name: "projectCreate",
    area: "projects",
    risk: "write",
    access: "admin",
    summary: "Create a project.",
    description:
      "Create the record through the shared service, derive its slug, and synchronize references. Optional images support upload, public URL, data URL, keep, or clear. ",
    input: projectCreateInput,
    output: projectOutput,
    examples: [{ title: "Create", input: { name: "Project", description: "Description" } }],
    run: async (_context, input) => {
      const { logo, coverImage, links, technologyIds, ...fields } = input;
      if (technologyIds !== undefined) await validateTechnologyIds(technologyIds);
      const result = await withEntityImages(
        { type: "project" },
        { icon: logo, cover: coverImage },
        async (images) => {
          const record = await createProject({
            links:
              links === undefined
                ? undefined
                : links && Object.values(links).some(Boolean)
                  ? stringifyProjectLinks(links)
                  : null,
            ...fields,
            ...images,
          });
          if (technologyIds !== undefined)
            await setTechnologiesForContent("project", record.id, technologyIds);
          return record;
        },
      );
      return toPlain(result);
    },
  }),
  projectUpdate: defineOperation({
    name: "projectUpdate",
    area: "projects",
    risk: "write",
    access: "admin",
    summary: "Update a project.",
    description:
      "Patch only supplied fields; empty patches and unknown keys fail. Renaming regenerates the slug and text changes synchronize references. Replaced or cleared images are removed only when unreferenced.",
    input: projectUpdateInput,
    output: projectOutput,
    examples: [{ title: "Rename", input: { id: 1, name: "Updated Project" } }],
    run: async (_context, input) => {
      const { id, logo, coverImage, links, technologyIds, ...fields } = input;
      if (!(await getProjectById(id))) throw new NotFoundError("Project not found");
      if (technologyIds !== undefined) await validateTechnologyIds(technologyIds);
      const result = await withEntityImages(
        { type: "project", id },
        { icon: logo, cover: coverImage },
        async (images) => {
          const record = (await updateProject(id, {
            links:
              links === undefined
                ? undefined
                : links && Object.values(links).some(Boolean)
                  ? stringifyProjectLinks(links)
                  : null,
            ...fields,
            ...images,
          }))!;
          if (technologyIds !== undefined)
            await setTechnologiesForContent("project", record.id, technologyIds);
          return record;
        },
      );
      return toPlain(result);
    },
  }),
  projectDelete: defineOperation({
    name: "projectDelete",
    area: "projects",
    risk: "destructive",
    access: "admin",
    summary: "Delete a project.",
    description:
      "Delete the record and clean up unreferenced images. Requires confirm: true. Returns the deleted record for review history.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true), record: projectOutput }).strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: async (_context, input) => {
      const record = await getProjectById(input.id);
      if (!record) throw new NotFoundError("Project not found");
      await deleteProject(input.id);
      return { deleted: true as const, record: toPlain(record) };
    },
  }),
};
