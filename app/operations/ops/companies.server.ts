import { directoryListInputs } from "../contracts/directory-lists";
import { page } from "../listing";
import { listCompanies } from "~/lib/directory-lists.server";
import { getTechnologiesForContent } from "~/lib/technologies.server";
import { technologyAssignmentOutput } from "../contracts/directory-relations";
import {
  applyCompanyTechnologyChanges,
  validateCompanyTechnologyChanges,
} from "./directory-technologies.server";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { lookupInput, adminListInput } from "../fields";
import { companyCreateInput, companyUpdateInput } from "../contracts/companies";
import { companyOutput } from "../contracts/companies";
import {
  createCompany,
  updateCompany,
  getCompanyById,
  getAllCompanies,
} from "~/lib/companies.server";
import { withEntityImages } from "~/lib/entity-images.server";

export const companyOperations = {
  companyList: defineOperation({
    name: "companyList",
    area: "companies",
    risk: "read",
    access: "admin",
    summary: "List companies for administration.",
    description:
      "Return a bounded page including hidden records. Filter by query or visibility. Use companyGet for one record.",
    input: directoryListInputs.company,
    output: page(companyOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(listCompanies(input)),
  }),
  companyGet: defineOperation({
    name: "companyGet",
    area: "companies",
    risk: "read",
    access: "admin",
    summary: "Get one company.",
    description:
      "Return the stored record including hidden fields for administration. Throws when the record does not exist.",
    input: lookupInput,
    output: companyOutput.extend({ technologies: z.array(technologyAssignmentOutput) }).strict(),
    examples: [{ title: "By ID", input: { id: 1 } }],
    run: async (_context, input) => {
      const record =
        input.id !== undefined
          ? await getCompanyById(input.id)
          : (await getAllCompanies(true)).find((item) =>
              input.slug !== undefined
                ? item.slug === input.slug
                : item.name.toLowerCase() === input.name?.toLowerCase(),
            );
      if (!record) throw new NotFoundError("Company not found");
      return toPlain({
        ...record,
        technologies: await getTechnologiesForContent("company", record.id),
      });
    },
  }),
  companyCreate: defineOperation({
    name: "companyCreate",
    area: "companies",
    risk: "write",
    access: "admin",
    summary: "Create a company.",
    description:
      "Create the record through the shared service, derive its slug, and synchronize references. Optional images support upload, public URL, data URL, keep, or clear. New records default to hidden until approved.",
    input: companyCreateInput,
    output: companyOutput,
    examples: [{ title: "Create", input: { name: "Company", description: "Description" } }],
    run: async (_context, input) => {
      const { logo, coverImage, technologyIds, evidenceGroups, ...fields } = input;

      await validateCompanyTechnologyChanges(undefined, technologyIds, evidenceGroups);
      const result = await withEntityImages(
        { type: "company" },
        { icon: logo, cover: coverImage },
        async (images) => {
          const record = await createCompany({
            ...fields,
            visible: fields.visible ?? false,
            ...images,
          });
          await applyCompanyTechnologyChanges(record.id, technologyIds, evidenceGroups);
          return record;
        },
      );
      return toPlain(result);
    },
  }),
  companyUpdate: defineOperation({
    name: "companyUpdate",
    area: "companies",
    risk: "write",
    access: "admin",
    summary: "Update a company.",
    description:
      "Patch only supplied fields; empty patches and unknown keys fail. Renaming regenerates the slug and text changes synchronize references. Replaced or cleared images are removed only when unreferenced.",
    input: companyUpdateInput,
    output: companyOutput,
    examples: [{ title: "Rename", input: { id: 1, name: "Updated Company" } }],
    run: async (_context, input) => {
      const { id, logo, coverImage, technologyIds, evidenceGroups, ...fields } = input;
      if (!(await getCompanyById(id))) throw new NotFoundError("Company not found");
      await validateCompanyTechnologyChanges(id, technologyIds, evidenceGroups);
      const result = await withEntityImages(
        { type: "company", id },
        { icon: logo, cover: coverImage },
        async (images) => {
          const record = (await updateCompany(id, { ...fields, ...images }))!;
          await applyCompanyTechnologyChanges(record.id, technologyIds, evidenceGroups);
          return record;
        },
      );
      return toPlain(result);
    },
  }),
};
