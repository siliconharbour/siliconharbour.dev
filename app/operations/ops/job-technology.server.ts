import { z } from "zod";
import { defineOperation } from "../define";
import { ConflictError, InvalidOperationError } from "../errors";
import { idInput } from "../fields";
import {
  jobManualSyncInput,
  jobSyncOutput,
  jobTechnologyApplyInput,
  technologyPreviewOutput,
  technologyPreviewDefaults,
  technologyApplyOutput,
} from "../contracts/jobs";
import { requireJobSource } from "./job-sources.server";
import { getCompanyById } from "~/lib/companies.server";
import { syncJobsFromFetched } from "~/lib/job-importers/sync.server";
import { parseManualJobsJson, isVerafinManualSource } from "~/lib/job-importers/manual";
import {
  extractTechnologiesForSource,
  getTechnologyPreviewForSource,
} from "~/lib/job-importers/tech-extractor.server";
import { applyTechnologyEvidenceFromJobMentions } from "~/lib/technologies.server";
import { getTechnologyProvenanceSourceByKey } from "~/lib/technology-evidence";
import { validateTechnologyIds } from "./directory-technologies.server";
export const jobTechnologyOperations = {
  jobSourceManualSync: defineOperation({
    name: "jobSourceManualSync",
    area: "jobs",
    risk: "write",
    access: "admin",
    summary: "Ingest captured Verafin job JSON.",
    description:
      "Accept the browser-captured JSON array or object with jobs. Only the configured Verafin manual source supports this flow. Reconcile jobs using the same importer lifecycle rules without a network fetch.",
    input: jobManualSyncInput,
    output: jobSyncOutput.extend({ parsedCount: z.number() }).strict(),
    examples: [
      {
        title: "Captured job",
        input: {
          id: 3,
          json: '[{"externalId":"123","title":"Developer","url":"https://example.com/job"}]',
        },
      },
    ],
    run: async (_ctx, input) => {
      const source = await requireJobSource(input.id);
      if (!isVerafinManualSource(source))
        throw new ConflictError("Manual ingestion is not enabled for this source.");
      const parsed = parseManualJobsJson(input.json);
      if (!parsed.jobs) throw new InvalidOperationError(parsed.error ?? "Invalid manual JSON");
      return {
        parsedCount: parsed.jobs.length,
        ...(await syncJobsFromFetched(input.id, parsed.jobs)),
      };
    },
  }),
  jobSourceTechPreviewExtract: defineOperation({
    name: "jobSourceTechPreviewExtract",
    area: "jobs",
    risk: "write",
    access: "admin",
    summary: "Extract technology mentions for a job source.",
    description:
      "Replace extracted mentions for the source's eligible jobs and return a preview of matching technologies. This writes mention rows but does not apply company technology assignments.",
    input: idInput,
    output: z
      .object({
        extraction: z.object({ jobs: z.number(), mentions: z.number() }).strict(),
        preview: technologyPreviewOutput,
        defaults: technologyPreviewDefaults,
      })
      .strict(),
    examples: [{ title: "Extract preview", input: { id: 1 } }],
    run: async (ctx, { id }) => {
      const source = await requireJobSource(id);
      const company = await getCompanyById(source.companyId);
      const extraction = await extractTechnologiesForSource(id);
      return {
        extraction,
        preview: await getTechnologyPreviewForSource(id),
        defaults: {
          sourceKey: "job_postings",
          sourceUrl: source.sourceUrl || company?.careersUrl || company?.website || null,
          lastVerified: ctx.now().toISOString().slice(0, 7),
        },
      };
    },
  }),
  jobSourceTechPreviewApply: defineOperation({
    name: "jobSourceTechPreviewApply",
    area: "jobs",
    risk: "write",
    access: "admin",
    summary: "Apply selected job technology evidence to a company.",
    description:
      "Use technology IDs from this source's preview, assign them to its company, and attach job evidence. The provenance sourceKey supplies source defaults. Verification defaults to the current month. Existing unrelated assignments remain.",
    input: jobTechnologyApplyInput,
    output: z
      .object({
        applyResult: technologyApplyOutput,
        preview: technologyPreviewOutput,
        defaults: technologyPreviewDefaults,
      })
      .strict(),
    examples: [{ title: "Apply technology", input: { id: 1, technologyIds: [1] } }],
    run: async (ctx, input) => {
      const source = await requireJobSource(input.id);
      await validateTechnologyIds(input.technologyIds);
      const preview = await getTechnologyPreviewForSource(input.id);
      const allowed = new Set(preview.items.map((item) => item.technologyId));
      if (input.technologyIds.some((id) => !allowed.has(id)))
        throw new InvalidOperationError(
          "Selected technologies must belong to this source's preview",
        );
      const provenance = getTechnologyProvenanceSourceByKey(input.sourceKey);
      const sourceUrl = provenance.sourceUrl ?? input.sourceUrl ?? null;
      const lastVerified = input.lastVerified ?? ctx.now().toISOString().slice(0, 7);
      const applyResult = await applyTechnologyEvidenceFromJobMentions({
        companyId: source.companyId,
        sourceId: source.id,
        selectedTechnologyIds: input.technologyIds,
        sourceType: provenance.sourceType,
        sourceUrl,
        lastVerified,
      });
      return {
        applyResult,
        preview: await getTechnologyPreviewForSource(input.id),
        defaults: { sourceKey: provenance.key, sourceUrl, lastVerified },
      };
    },
  }),
};
