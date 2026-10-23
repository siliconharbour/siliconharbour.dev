import { z } from "zod";
import { defineOperation } from "../define";
import { toPlain } from "../plain";
import { NotFoundError, ConflictError } from "../errors";
import { idInput, deleteInput, emptyInput, confirm } from "../fields";
import { personOutput } from "../contracts/people";
import { companyOutput } from "../contracts/companies";
import { personBulkRejectInput, personDeleteInput } from "../contracts/people";
import { companyDeleteInput } from "../contracts/companies";
import {
  getPersonById,
  updatePerson,
  deletePerson,
  getHiddenPeople,
  hideAllVisiblePeople,
} from "~/lib/people.server";
import {
  getCompanyById,
  updateCompany,
  deleteCompany,
  hideAllVisibleCompanies,
} from "~/lib/companies.server";
import { blockItem } from "~/lib/import-blocklist.server";
import { normalizeBlockKey } from "~/lib/import-blocklist-key";

async function removePerson(id: number, block: boolean) {
  const person = await getPersonById(id);
  if (!person) throw new NotFoundError("Person not found");
  if (block && !person.github)
    throw new ConflictError("Cannot block a person without a GitHub profile");
  if (block && person.github)
    await blockItem("github", person.github, person.name, "Removed during review");
  await deletePerson(id);
  return { deleted: true as const, record: toPlain(person) };
}
async function removeCompany(id: number, source?: string) {
  const company = await getCompanyById(id);
  if (!company) throw new NotFoundError("Company not found");
  if (source)
    await blockItem(
      source,
      normalizeBlockKey(source, company.website || company.name),
      company.name,
      "Removed during review",
    );
  await deleteCompany(id);
  return { deleted: true as const, record: toPlain(company), blockedSource: source ?? null };
}

export const directoryReviewOperations = {
  personDelete: defineOperation({
    name: "personDelete",
    area: "people",
    risk: "destructive",
    access: "admin",
    summary: "Delete a person, optionally blocking future imports.",
    description:
      "Read the stored GitHub profile when block is provided, normalize its import key, block before deletion, and remove unreferenced images. Requires confirm: true. Returns the removed record.",
    input: personDeleteInput,
    output: z.object({ deleted: z.literal(true), record: personOutput }).strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: (_ctx, input) => removePerson(input.id, Boolean(input.block)),
  }),
  companyDelete: defineOperation({
    name: "companyDelete",
    area: "companies",
    risk: "destructive",
    access: "admin",
    summary: "Delete a company, optionally blocking a directory source.",
    description:
      "Use the stored website or lowercased name as the import key. Block before deletion and clean up unreferenced images. Requires confirm: true.",
    input: companyDeleteInput,
    output: z
      .object({
        deleted: z.literal(true),
        record: companyOutput,
        blockedSource: z.string().nullable(),
      })
      .strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: (_ctx, input) => removeCompany(input.id, input.block?.source),
  }),
  personApprove: defineOperation({
    name: "personApprove",
    area: "people",
    risk: "write",
    access: "admin",
    summary: "Approve a person for public display.",
    description: "Set visible to true. Use personUnapprove to hide the record without deleting it.",
    input: idInput,
    output: personOutput,
    examples: [{ title: "Approve", input: { id: 1 } }],
    run: async (_ctx, input) => {
      const person = await updatePerson(input.id, { visible: true });
      if (!person) throw new NotFoundError("Person not found");
      return toPlain(person);
    },
  }),
  personUnapprove: defineOperation({
    name: "personUnapprove",
    area: "people",
    risk: "write",
    access: "admin",
    summary: "Hide an approved person.",
    description: "Set visible to false while preserving the record and its images.",
    input: idInput,
    output: personOutput,
    examples: [{ title: "Hide", input: { id: 1 } }],
    run: async (_ctx, input) => {
      const person = await updatePerson(input.id, { visible: false });
      if (!person) throw new NotFoundError("Person not found");
      return toPlain(person);
    },
  }),
  personReject: defineOperation({
    name: "personReject",
    area: "people",
    risk: "destructive",
    access: "admin",
    summary: "Reject a person from the review queue.",
    description:
      "Block the stored GitHub import identity when present, then delete the record and unreferenced images. Requires confirm: true. Returns the deleted record for review history.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true), record: personOutput }).strict(),
    examples: [{ title: "Reject", input: { id: 1, confirm: true } }],
    run: async (_ctx, input) => {
      const person = await getPersonById(input.id);
      if (!person) throw new NotFoundError("Person not found");
      return removePerson(input.id, Boolean(person.github));
    },
  }),
  personBulkReject: defineOperation({
    name: "personBulkReject",
    area: "people",
    risk: "destructive",
    access: "admin",
    summary: "Reject hidden people matching every search term.",
    description:
      "Split pattern on spaces or commas and match every term against name, biography, and social links. Only hidden people are affected. Block each stored GitHub identity before deleting. Requires confirm: true.",
    input: personBulkRejectInput,
    output: z.object({ ids: z.array(z.number()), count: z.number() }).strict(),
    examples: [
      { title: "Reject matching imports", input: { pattern: "Amsterdam NL", confirm: true } },
    ],
    run: async (_ctx, input) => {
      const terms = input.pattern
        .toLowerCase()
        .split(/[,\s]+/)
        .filter(Boolean);
      const matches = (await getHiddenPeople()).filter((person) =>
        terms.every((term) =>
          `${person.name} ${person.bio} ${Object.values(person.socialLinks ?? {}).join(" ")}`
            .toLowerCase()
            .includes(term),
        ),
      );
      for (const person of matches) await removePerson(person.id, Boolean(person.github));
      return { ids: matches.map((person) => person.id), count: matches.length };
    },
  }),
  personHideAllVisible: defineOperation({
    name: "personHideAllVisible",
    area: "people",
    risk: "destructive",
    access: "admin",
    summary: "Hide all visible people.",
    description: "Set visible to false without deleting records or images. Requires confirm: true.",
    input: emptyInput.extend({ confirm }).strict(),
    output: z.object({ hidden: z.number() }).strict(),
    examples: [{ title: "Hide all", input: { confirm: true } }],
    run: async () => ({ hidden: await hideAllVisiblePeople() }),
  }),
  companyApprove: defineOperation({
    name: "companyApprove",
    area: "companies",
    risk: "write",
    access: "admin",
    summary: "Approve a company for public display.",
    description: "Set visible to true. Use companyUnapprove to hide it without deletion.",
    input: idInput,
    output: companyOutput,
    examples: [{ title: "Approve", input: { id: 1 } }],
    run: async (_ctx, input) => {
      const company = await updateCompany(input.id, { visible: true });
      if (!company) throw new NotFoundError("Company not found");
      return toPlain(company);
    },
  }),
  companyUnapprove: defineOperation({
    name: "companyUnapprove",
    area: "companies",
    risk: "write",
    access: "admin",
    summary: "Hide an approved company.",
    description: "Set visible to false while preserving the record and its images.",
    input: idInput,
    output: companyOutput,
    examples: [{ title: "Hide", input: { id: 1 } }],
    run: async (_ctx, input) => {
      const company = await updateCompany(input.id, { visible: false });
      if (!company) throw new NotFoundError("Company not found");
      return toPlain(company);
    },
  }),
  companyReject: defineOperation({
    name: "companyReject",
    area: "companies",
    risk: "destructive",
    access: "admin",
    summary: "Reject a company from the review queue.",
    description:
      "Block the stored TechNL or Genesis import identity when marked as imported, then delete the record and unreferenced images. Requires confirm: true.",
    input: deleteInput,
    output: z
      .object({
        deleted: z.literal(true),
        record: companyOutput,
        blockedSource: z.string().nullable(),
      })
      .strict(),
    examples: [{ title: "Reject", input: { id: 1, confirm: true } }],
    run: async (_ctx, input) => {
      const company = await getCompanyById(input.id);
      if (!company) throw new NotFoundError("Company not found");
      return removeCompany(
        input.id,
        company.technl ? "technl" : company.genesis ? "genesis" : undefined,
      );
    },
  }),
  companyHideAllVisible: defineOperation({
    name: "companyHideAllVisible",
    area: "companies",
    risk: "destructive",
    access: "admin",
    summary: "Hide all visible companies.",
    description:
      "Preserve company records and images while hiding their directory listings. Requires confirm: true.",
    input: emptyInput.extend({ confirm }).strict(),
    output: z.object({ hidden: z.number() }).strict(),
    examples: [{ title: "Hide all", input: { confirm: true } }],
    run: async () => ({ hidden: await hideAllVisibleCompanies() }),
  }),
};
