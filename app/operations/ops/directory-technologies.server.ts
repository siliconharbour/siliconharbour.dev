import { getJobById } from "~/lib/jobs.server";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError, ConflictError } from "../errors";
import {
  companyConvertToEducationInput,
  companyTechnologiesSetInput,
  companyTechnologyEvidenceSetInput,
  evidenceGroup,
} from "../contracts/companies";
import { educationOutput } from "../contracts/education";
import { toPlain } from "../plain";
import { getCompanyById } from "~/lib/companies.server";
import { convertCompanyToEducation } from "~/lib/education.server";
import {
  getTechnologyById,
  getTechnologiesForContent,
  setTechnologiesForContent,
  setTechnologyEvidenceForCompany,
} from "~/lib/technologies.server";
import { getTechnologyProvenanceSourceByKey } from "~/lib/technology-evidence";

type EvidenceGroup = z.output<typeof evidenceGroup>;
export async function validateTechnologyIds(ids: number[]) {
  const found = await Promise.all(ids.map(getTechnologyById));
  if (found.some((technology) => !technology))
    throw new NotFoundError("One or more technologies do not exist");
}
export async function validateCompanyTechnologyChanges(
  id: number | undefined,
  technologyIds?: number[],
  groups?: EvidenceGroup[],
) {
  if (technologyIds !== undefined) await validateTechnologyIds(technologyIds);
  if (groups !== undefined) {
    const jobIds = [...new Set(groups.flatMap((group) => group.jobIds))];
    const jobs = await Promise.all(jobIds.map(getJobById));
    if (jobs.some((job) => !job)) throw new NotFoundError("Evidence job does not exist");
    const assigned = new Set(
      technologyIds ??
        (id ? await getTechnologiesForContent("company", id) : []).map((item) => item.technologyId),
    );
    if (
      groups.some((group) =>
        group.technologyIds.some((technologyId) => !assigned.has(technologyId)),
      )
    )
      throw new ConflictError("Evidence must refer to technologies assigned to this company");
  }
}
export async function applyCompanyTechnologyChanges(
  id: number,
  technologyIds?: number[],
  groups?: EvidenceGroup[],
) {
  await validateCompanyTechnologyChanges(id, technologyIds, groups);
  if (technologyIds !== undefined)
    await setTechnologiesForContent("company", id, [...new Set(technologyIds)]);
  if (groups !== undefined)
    await setTechnologyEvidenceForCompany(
      id,
      groups.map((group) => {
        const source = group.sourceKey
          ? getTechnologyProvenanceSourceByKey(group.sourceKey)
          : undefined;
        return {
          technologyIds: group.technologyIds,
          sourceType: source?.sourceType ?? group.sourceType ?? "manual",
          sourceUrl: source?.sourceUrl ?? group.sourceUrl,
          lastVerified: group.lastVerified,
          jobIds: group.jobIds,
          excerptText: group.excerptText,
        };
      }),
    );
}

export const directoryTechnologyOperations = {
  companyConvertToEducation: defineOperation({
    name: "companyConvertToEducation",
    area: "companies",
    risk: "destructive",
    access: "admin",
    summary: "Convert a company into an education institution.",
    description:
      "Create an institution using the company data and selected institution type, then remove the company using the existing conversion service. Requires confirm: true.",
    input: companyConvertToEducationInput,
    output: educationOutput,
    examples: [{ title: "Convert", input: { id: 1, institutionType: "other", confirm: true } }],
    run: async (_ctx, input) => {
      if (!(await getCompanyById(input.id))) throw new NotFoundError("Company not found");
      return toPlain(await convertCompanyToEducation(input.id, input.institutionType));
    },
  }),
  companyTechnologiesSet: defineOperation({
    name: "companyTechnologiesSet",
    area: "companies",
    risk: "write",
    access: "admin",
    summary: "Replace a company's technology assignments.",
    description:
      "Assign exactly technologyIds; an empty array clears the stack. Every technology must exist. Removed assignments also remove their evidence.",
    input: companyTechnologiesSetInput,
    output: z.object({ updated: z.literal(true), technologyIds: z.array(z.number()) }).strict(),
    examples: [{ title: "Clear stack", input: { id: 1, technologyIds: [] } }],
    run: async (_ctx, input) => {
      if (!(await getCompanyById(input.id))) throw new NotFoundError("Company not found");
      await applyCompanyTechnologyChanges(input.id, input.technologyIds);
      return { updated: true as const, technologyIds: [...new Set(input.technologyIds)] };
    },
  }),
  companyTechnologyEvidenceSet: defineOperation({
    name: "companyTechnologyEvidenceSet",
    area: "companies",
    risk: "write",
    access: "admin",
    summary: "Replace evidence for a company's technology stack.",
    description:
      "Use groups of assigned technology IDs with provenance, verification dates, excerpts, and job IDs. A sourceKey resolves the same provenance defaults used by admin; an explicit sourceType can also be supplied. Empty groups clear evidence.",
    input: companyTechnologyEvidenceSetInput,
    output: z.object({ updated: z.literal(true) }).strict(),
    examples: [{ title: "Clear evidence", input: { id: 1, groups: [] } }],
    run: async (_ctx, input) => {
      if (!(await getCompanyById(input.id))) throw new NotFoundError("Company not found");
      await applyCompanyTechnologyChanges(input.id, undefined, input.groups);
      return { updated: true as const };
    },
  }),
};
