import { importSyncAll } from "~/lib/import-sync.server";
import { z } from "zod";
import { defineOperation } from "../define";
import { emptyInput, text, confirm } from "../fields";
import { asyncSyncOutput } from "../contracts/importers";
import { getAsyncSync, listAsyncSyncs } from "~/lib/async-syncs.server";
import { getAllImporterMeta } from "~/lib/job-importers";
import { NotFoundError } from "../errors";
export const importerStatusOperations = {
  importSyncAll: defineOperation({
    name: "importSyncAll",
    area: "importers",
    risk: "external",
    access: "admin",
    summary: "Queue an asynchronous sync across import source types.",
    description:
      "Queue each selected source once, in event, job, then news order. Event sources use the shared ordering and Luma request queue. Defaults to all types. Returns one process-local run; poll with asyncSyncGet. Avoid overlapping scheduled runs. Requires confirm: true.",
    input: z
      .object({
        types: z
          .array(z.enum(["event", "job", "news"]))
          .min(1)
          .max(3)
          .transform((values) => [...new Set(values)])
          .default(["event", "job", "news"]),
        confirm,
      })
      .strict(),
    output: asyncSyncOutput,
    examples: [{ title: "Sync all source types", input: { confirm: true } }],
    run: (_ctx, input) => importSyncAll(input.types),
  }),
  asyncSyncGet: defineOperation({
    name: "asyncSyncGet",
    area: "importers",
    risk: "read",
    access: "admin",
    summary: "Get an asynchronous import sync run.",
    description:
      "Poll a process-local run ID for current step, lifecycle counts, per-source results, or errors. Old completed runs may be evicted.",
    input: z.object({ id: text("id", 100) }).strict(),
    output: asyncSyncOutput,
    examples: [{ title: "Poll run", input: { id: "example" } }],
    run: (_ctx, { id }) => {
      const run = getAsyncSync(id);
      if (!run) throw new NotFoundError("Sync run not found");
      return run;
    },
  }),
  asyncSyncList: defineOperation({
    name: "asyncSyncList",
    area: "importers",
    risk: "read",
    access: "admin",
    summary: "List recent asynchronous sync runs.",
    description:
      "Return process-local sync runs newest first. These include operational error details and are administrator-only.",
    input: emptyInput,
    output: z.array(asyncSyncOutput),
    examples: [{ title: "Recent runs", input: {} }],
    run: () => listAsyncSyncs(),
  }),
  importerTypeList: defineOperation({
    name: "importerTypeList",
    area: "importers",
    risk: "read",
    access: "admin",
    summary: "List supported job importers.",
    description:
      "Return ATS type identifiers with approach, reliability, and operational notes. No live source requests run.",
    input: emptyInput,
    output: z.array(
      z
        .object({
          sourceType: z.string(),
          name: z.string(),
          approach: z.string(),
          style: z.string(),
          reliability: z.string(),
          quirks: z.string().optional(),
        })
        .strict(),
    ),
    examples: [{ title: "Importer types", input: {} }],
    run: () => getAllImporterMeta(),
  }),
};
