import { z } from "zod";
import { technologyEvidenceSourceTypes, technologizedTypes } from "../fields";
import { technologyOutput } from "./technologies";

export const technologyAssignmentOutput = z
  .object({
    id: z.number(),
    technologyId: z.number(),
    contentType: z.enum(technologizedTypes),
    contentId: z.number(),
    source: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    lastVerified: z.string().nullable(),
    createdAt: z.iso.datetime(),
    technology: technologyOutput,
    evidence: z.array(
      z
        .object({
          id: z.number(),
          sourceType: z.enum(technologyEvidenceSourceTypes),
          sourceUrl: z.string().nullable(),
          excerptText: z.string().nullable(),
          lastVerified: z.string().nullable(),
          jobId: z.number().nullable(),
          jobTitle: z.string().nullable(),
          jobUrl: z.string().nullable(),
          jobStatus: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export const projectImageOutput = z
  .object({
    id: z.number(),
    projectId: z.number(),
    image: z.string(),
    caption: z.string().nullable(),
    sortOrder: z.number(),
    createdAt: z.iso.datetime(),
  })
  .strict();
