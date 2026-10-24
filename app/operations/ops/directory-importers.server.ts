import {
  reviewDirectorySource,
  reconcileDirectorySource,
  clearDirectorySourceFlags,
} from "~/lib/directory-source-review.server";
import {
  directoryEntity,
  directoryFetchOutput,
  directorySourceFlagsClearInput,
} from "../contracts/importers";
import { buildDirectoryImportLoaderData } from "~/lib/directory-import.server";
import { directorySource, directoryReviewOutput } from "../contracts/importers";
import { z } from "zod";
import { defineOperation } from "../define";
import {
  directoryFetchInput,
  directoryImportInput,
  directoryAdoptInput,
  importBatchOutput,
} from "../contracts/importers";
import { directoryImportConfigs } from "~/lib/directory-import-config.server";
import { importDirectoryCompanies, adoptDirectoryField } from "~/lib/directory-import-write.server";
export const directoryImporterOperations = {
  directoryImportReviewGet: defineOperation({
    name: "directoryImportReviewGet",
    area: "importers",
    risk: "read",
    access: "admin",
    summary: "Get directory review matches and blocklist keys.",
    description:
      "Return existing identities and field values for comparing directory candidates. Includes hidden records; no scraping runs.",
    input: z.object({ source: directorySource }).strict(),
    output: directoryReviewOutput,
    examples: [{ title: "TechNL review", input: { source: "technl" } }],
    run: (_ctx, { source }) => buildDirectoryImportLoaderData(directoryImportConfigs[source]),
  }),
  directoryImportFetch: defineOperation({
    name: "directoryImportFetch",
    area: "importers",
    risk: "external",
    access: "admin",
    summary: "Fetch a company directory for review.",
    description:
      "Scrape the fixed TechNL, Genesis, or Bounce source and return candidates, dropped memberships, and possible rename matches without writing anything. Empty or suspiciously small results return a warning instead of removals. Requires confirm: true.",
    input: directoryFetchInput,
    output: directoryFetchOutput,
    examples: [{ title: "Fetch TechNL", input: { source: "technl", confirm: true } }],
    run: async (_ctx, { source }) =>
      reviewDirectorySource(source, await directoryImportConfigs[source].scrapeFn()),
  }),
  directoryImport: defineOperation({
    name: "directoryImport",
    area: "importers",
    risk: "write",
    access: "admin",
    summary: "Import reviewed directory companies.",
    description:
      "Skip normalized blocklist identities. Existing companies gain the source flag without overwriting curated data; new companies are hidden. Optional logos use the public image guard. Return per-company results and errors.",
    input: directoryImportInput,
    output: importBatchOutput,
    examples: [
      {
        title: "Import company",
        input: { source: "technl", companies: [{ name: "Example", description: "Description" }] },
      },
    ],
    run: (ctx, input) =>
      importDirectoryCompanies(input.source, input.companies, input.downloadLogos, ctx.now()),
  }),
  directorySourceReconcile: defineOperation({
    name: "directorySourceReconcile",
    area: "importers",
    risk: "external",
    access: "admin",
    summary: "Record directory matches from a fresh source fetch.",
    description:
      "Fetch the full source and record IDs and last-seen timestamps for unambiguous existing matches. Never create records or change membership flags. Reject removal review for empty or suspiciously small scrapes. Requires confirm: true.",
    input: directoryFetchInput,
    output: z.object({ recorded: z.number().int(), warning: z.string().nullable() }).strict(),
    examples: [{ title: "Record TechNL matches", input: { source: "technl", confirm: true } }],
    run: async (ctx, { source }) =>
      reconcileDirectorySource(source, await directoryImportConfigs[source].scrapeFn(), ctx.now()),
  }),
  directorySourceFlagsClear: defineOperation({
    name: "directorySourceFlagsClear",
    area: "importers",
    risk: "destructive",
    access: "admin",
    summary: "Clear reviewed directory membership flags.",
    description:
      "Clear only the selected company's or institution's flag for one source. Preserve other memberships, visibility and historical last-seen metadata. Never delete records. Requires confirm: true.",
    input: directorySourceFlagsClearInput,
    output: z.object({ cleared: z.number().int(), entities: z.array(directoryEntity) }).strict(),
    examples: [
      {
        title: "Clear reviewed memberships",
        input: { source: "technl", entities: [{ type: "company", id: 1 }], confirm: true },
      },
    ],
    run: (ctx, input) => clearDirectorySourceFlags(input.source, input.entities, ctx.now()),
  }),
  directoryImportAdoptField: defineOperation({
    name: "directoryImportAdoptField",
    area: "importers",
    risk: "write",
    access: "admin",
    summary: "Adopt a reviewed company field from a directory.",
    description:
      "Find the company by name or fallback website, then update only website, description, or email through the shared company service. Synchronize references and preserve other curated fields.",
    input: directoryAdoptInput,
    output: z
      .object({ name: z.string(), field: z.enum(["website", "description", "email"]) })
      .strict(),
    examples: [
      {
        title: "Adopt description",
        input: {
          source: "technl",
          name: "Example",
          field: "description",
          value: "Updated description",
        },
      },
    ],
    run: (_ctx, input) => adoptDirectoryField(input),
  }),
};
