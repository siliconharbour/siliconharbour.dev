import { buildDirectoryImportLoaderData } from "~/lib/directory-import.server";
import { directorySource, directoryReviewOutput } from "../contracts/importers";
import { z } from "zod";
import { defineOperation } from "../define";
import {
  directoryFetchInput,
  directoryImportInput,
  directoryAdoptInput,
  scrapedCompany,
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
      "Scrape the fixed TechNL, Genesis, or Bounce source and return company candidates without importing them. Requires confirm: true.",
    input: directoryFetchInput,
    output: z.array(scrapedCompany),
    examples: [{ title: "Fetch TechNL", input: { source: "technl", confirm: true } }],
    run: (_ctx, { source }) => directoryImportConfigs[source].scrapeFn(),
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
    run: (_ctx, input) =>
      importDirectoryCompanies(input.source, input.companies, input.downloadLogos),
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
