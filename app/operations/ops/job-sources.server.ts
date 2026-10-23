import { getImportSourceWithStats } from "~/lib/job-importers/sync.server";
import { id } from "../fields";
import { jobOutput } from "../contracts/jobs";
import { createIfAbsent, recordIdentity, identityKey } from "../creation.server";
import { getAllImportSources } from "~/lib/job-importers/sync.server";
import { listInput, page, collectionPage } from "../listing";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError, InvalidOperationError } from "../errors";
import { toPlain } from "../plain";
import { deleteInput } from "../fields";
import { eventSyncInput, eventSyncAllInput } from "../contracts/events";
import { asyncSyncOutput } from "../contracts/importers";
import {
  jobSourceCreateInput,
  jobSourceUpdateInput,
  jobSourceOutput,
  jobSyncOutput,
  jobSyncAllOutput,
} from "../contracts/jobs";
import {
  getAllImportSourcesWithStats,
  getSourceById,
  createImportSource,
  updateImportSource,
  deleteImportSource,
  syncJobs,
} from "~/lib/job-importers/sync.server";
import { syncAllJobSources } from "~/lib/job-importers/sync-all.server";
import { getCompanyById } from "~/lib/companies.server";
import { getImporter } from "~/lib/job-importers";
import { startAsyncSync } from "~/lib/async-syncs.server";
export async function requireJobSource(id: number) {
  const source = await getSourceById(id);
  if (!source) throw new NotFoundError("Job source not found");
  return source;
}

export const jobSourceOperations = {
  jobSourceGet: defineOperation({
    name: "jobSourceGet",
    area: "jobs",
    risk: "read",
    access: "admin",
    summary: "Get an import source and its review records.",
    description:
      "Return source configuration, lifecycle groups and review data for administrators. Throws when the source does not exist. Use the entity list for filtered pages.",
    input: z.object({ id: id() }).strict(),
    output: jobSourceOutput
      .extend({
        activeJobCount: z.number(),
        pendingReviewCount: z.number(),
        hiddenJobCount: z.number(),
        removedJobCount: z.number(),
        totalJobCount: z.number(),
        jobs: z.array(jobOutput),
      })
      .strict(),
    examples: [{ title: "Source", input: { id: 1 } }],
    run: async (_ctx, { id }) => {
      const source = await getImportSourceWithStats(id);
      if (!source) throw new NotFoundError("Source not found");
      return toPlain(source);
    },
  }),
  jobSourceList: defineOperation({
    name: "jobSourceList",
    area: "jobs",
    risk: "read",
    access: "admin",
    summary: "List job import sources and lifecycle counts.",
    description:
      "Return ATS configuration and active, pending, hidden, removed, filled, expired, and total job counts.",
    input: listInput(["createdAt", "name"]),
    output: page(
      jobSourceOutput
        .extend({
          companyName: z.string().nullable(),
          activeJobCount: z.number(),
          pendingReviewCount: z.number(),
          hiddenJobCount: z.number(),
          removedJobCount: z.number(),
          filledJobCount: z.number(),
          expiredJobCount: z.number(),
          totalJobCount: z.number(),
        })
        .strict(),
    ),
    examples: [{ title: "All sources", input: {} }],
    run: async (ctx, input) =>
      toPlain(
        collectionPage(await getAllImportSourcesWithStats(), input, {
          createdAt: (row) => row.createdAt,
          name: (row) => `${row.companyName ?? ""} ${row.sourceIdentifier}`,
          sourceUrl: (row) => row.sourceUrl,
        }),
      ),
  }),
  jobSourceCreate: defineOperation({
    name: "jobSourceCreate",
    area: "jobs",
    risk: "external",
    access: "admin",
    summary: "Validate and create a job import source.",
    description:
      "Validate ATS configuration using a live fetch unless skipValidation is true. The company must exist. No sync runs after creation. Requires confirm: true. Set ifNotExists to return an existing record by company ID, source type and provider identifier. Existing records are unchanged and return created:false; new records return created:true.",
    input: jobSourceCreateInput,
    output: jobSourceOutput.extend({ created: z.boolean() }).strict(),
    examples: [
      {
        title: "Add ATS source",
        input: {
          companyId: 1,
          sourceType: "greenhouse",
          sourceIdentifier: "example",
          confirm: true,
        },
      },
    ],
    run: (ctx, { ifNotExists, ...input }) =>
      createIfAbsent(
        "job-source",
        ifNotExists,
        recordIdentity(
          identityKey(input.companyId, input.sourceType, input.sourceIdentifier),
          getAllImportSources,
          (row) =>
            row.companyId === input.companyId &&
            row.sourceType === input.sourceType &&
            row.sourceIdentifier === input.sourceIdentifier,
        ),
        async () => {
          if (!(await getCompanyById(input.companyId)))
            throw new NotFoundError("Company not found");
          const config = {
            companyId: input.companyId,
            sourceType: input.sourceType,
            sourceIdentifier: input.sourceIdentifier,
            sourceUrl: input.sourceUrl,
          };
          const importer = getImporter(input.sourceType);
          if (!input.skipValidation) {
            const result = await importer.validateConfig(config);
            if (!result.valid)
              throw new InvalidOperationError(result.error ?? "Invalid source configuration");
          }
          const id = await createImportSource(config);
          return toPlain(await requireJobSource(id));
        },
      ),
  }),
  jobSourceUpdate: defineOperation({
    name: "jobSourceUpdate",
    area: "jobs",
    risk: "write",
    access: "admin",
    summary: "Update job source configuration.",
    description:
      "Patch ATS type, identifier, or URL without running a sync. Company ownership stays fixed.",
    input: jobSourceUpdateInput,
    output: jobSourceOutput,
    examples: [{ title: "Change identifier", input: { id: 1, sourceIdentifier: "example" } }],
    run: async (_ctx, { id, ...fields }) => {
      await requireJobSource(id);
      await updateImportSource(id, fields);
      return toPlain(await requireJobSource(id));
    },
  }),
  jobSourceDelete: defineOperation({
    name: "jobSourceDelete",
    area: "jobs",
    risk: "destructive",
    access: "admin",
    summary: "Delete a job source.",
    description:
      "Remove the source and cascade its imported jobs using the existing service. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true) }).strict(),
    examples: [{ title: "Delete source", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => {
      await requireJobSource(id);
      await deleteImportSource(id);
      return { deleted: true as const };
    },
  }),
  jobSourceSync: defineOperation({
    name: "jobSourceSync",
    area: "jobs",
    risk: "external",
    access: "admin",
    summary: "Sync one ATS job source.",
    description:
      "Fetch live jobs and apply importer lifecycle rules. Requires confirm: true. Set async to return a run ID immediately; poll asyncSyncGet.",
    input: eventSyncInput,
    output: z.union([jobSyncOutput, asyncSyncOutput]),
    examples: [{ title: "Sync source", input: { id: 1, confirm: true } }],
    run: async (ctx, input) => {
      const source = await requireJobSource(input.id);
      return input.async
        ? startAsyncSync(
            [
              {
                type: "job",
                sourceId: source.id,
                name: source.sourceIdentifier,
                run: () => syncJobs(source.id),
              },
            ],
            ctx.actor,
          )
        : syncJobs(source.id);
    },
  }),
  jobSourceSyncAll: defineOperation({
    name: "jobSourceSyncAll",
    area: "jobs",
    risk: "external",
    access: "admin",
    summary: "Sync every ATS job source.",
    description:
      "Fetch sources sequentially and return aggregate lifecycle counts and per-source results. Requires confirm: true. Set async to poll the run with asyncSyncGet.",
    input: eventSyncAllInput,
    output: z.union([jobSyncAllOutput, asyncSyncOutput]),
    examples: [{ title: "Sync all", input: { confirm: true } }],
    run: async (ctx, input) =>
      input.async
        ? startAsyncSync(
            (await getAllImportSourcesWithStats()).map((source) => ({
              type: "job" as const,
              sourceId: source.id,
              name: source.sourceIdentifier,
              run: () => syncJobs(source.id),
            })),
            ctx.actor,
          )
        : syncAllJobSources(),
  }),
};
