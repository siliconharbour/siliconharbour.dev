import { blocklistReason } from "./blocklist";
import { createOptions } from "../fields";
import { email } from "../fields";
import { nullableGithubProfile } from "../fields";
import { technologyProvenanceSourceKeys } from "../fields";
import { z } from "zod";
import {
  text,
  nullableText,
  nullableUrl,
  imageInput,
  updateContract,
  id,
  confirm,
  educationTypes,
  technologyEvidenceSourceTypes,
} from "../fields";
export const evidenceGroup = z
  .object({
    technologyIds: z.array(id()).max(500),
    sourceType: z.enum(technologyEvidenceSourceTypes).optional(),
    sourceKey: z.enum(technologyProvenanceSourceKeys).optional(),
    sourceUrl: nullableUrl().default(null),
    lastVerified: z
      .string()
      .trim()
      .transform((value) => (/^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value))
      .pipe(z.iso.date())
      .nullable()
      .default(null),
    excerptText: nullableText().default(null),
    jobIds: z.array(id()).max(1000).default([]),
  })
  .strict();

export const companyFields = {
  technologyIds: z.array(id()).max(500).optional(),
  evidenceGroups: z.array(evidenceGroup).max(100).optional(),
  name: text("name", 300),
  description: text("description"),
  website: nullableUrl().optional(),
  wikipedia: nullableUrl().optional(),
  github: nullableGithubProfile().optional(),
  linkedin: nullableUrl().optional(),
  careersUrl: nullableUrl().optional(),
  email: nullableText(320).pipe(email().nullable()).optional(),
  location: nullableText().optional(),
  founded: nullableText(100).optional(),
  visible: z.boolean().optional(),
  technl: z.boolean().optional(),
  genesis: z.boolean().optional(),
  bounce: z.boolean().optional(),
  newsFilterInclude: z.boolean().optional(),
  logo: imageInput.optional(),
  coverImage: imageInput.optional(),
};
export const companyCreateInput = z.object(companyFields).strict().safeExtend(createOptions);
export const companyUpdateInput = updateContract(z.object(companyFields).partial().shape);
export const companyDeleteInput = z
  .object({
    id: id(),
    confirm,
    block: z
      .object({ source: z.enum(["technl", "genesis", "bounce"]), reason: blocklistReason })
      .strict()
      .optional(),
  })
  .strict();
export const companyConvertToEducationInput = z
  .object({ id: id(), institutionType: z.enum(educationTypes), confirm })
  .strict();
export const companyTechnologiesSetInput = z
  .object({ id: id(), technologyIds: z.array(id()).max(500) })
  .strict();
export const companyTechnologyEvidenceSetInput = z
  .object({ id: id(), groups: z.array(evidenceGroup).max(100) })
  .strict();

export const companyOutput = z
  .object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    website: z.string().nullable(),
    careersUrl: z.string().nullable(),
    wikipedia: z.string().nullable(),
    linkedin: z.string().nullable(),
    github: z.string().nullable(),
    email: z.string().nullable(),
    location: z.string().nullable(),
    founded: z.string().nullable(),
    logo: z.string().nullable(),
    coverImage: z.string().nullable(),
    technlExternalId: z.string().nullable(),
    technlLastSeenAt: z.iso.datetime().nullable(),
    genesisExternalId: z.string().nullable(),
    genesisLastSeenAt: z.iso.datetime().nullable(),
    bounceExternalId: z.string().nullable(),
    bounceLastSeenAt: z.iso.datetime().nullable(),
    technl: z.boolean().nullable(),
    genesis: z.boolean().nullable(),
    bounce: z.boolean().nullable(),
    newsFilterInclude: z.boolean().nullable(),
    visible: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
