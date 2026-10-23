import { createIfAbsent, urlIdentity } from "../creation.server";
import { getAllJobs } from "~/lib/jobs.server";
import { getTechNLJobsPage } from "~/lib/technl-jobs.server";
import { listInput } from "../listing";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { url } from "../fields";
import {
  jobSearchInput,
  jobSearchImportInput,
  jobOutput,
  indeedResultOutput,
  linkedInResultOutput,
  techNLJobOutput,
  techNLListOutput,
} from "../contracts/jobs";
import { searchIndeedWithMatches, searchLinkedInWithMatches } from "~/lib/job-search.server";
import { fetchTechNLJobsWithMatches } from "~/lib/technl-jobs.server";
import { createJob } from "~/lib/jobs.server";
import { getCompanyByName } from "~/lib/companies.server";
export const jobSearchOperations = {
  jobSearchIndeed: defineOperation({
    name: "jobSearchIndeed",
    area: "jobs",
    risk: "external",
    access: "admin",
    summary: "Search Indeed for jobs.",
    description:
      "Fetch live results with company, duplicate, and ATS-source matches. Does not save jobs. Requires confirm: true; use jobSearchImport to save one result.",
    input: jobSearchInput,
    output: z.array(indeedResultOutput),
    examples: [
      { title: "Search developers", input: { query: "Software Developer", confirm: true } },
    ],
    run: (_ctx, input) => searchIndeedWithMatches(input),
  }),
  jobSearchLinkedIn: defineOperation({
    name: "jobSearchLinkedIn",
    area: "jobs",
    risk: "external",
    access: "admin",
    summary: "Search LinkedIn for jobs.",
    description:
      "Fetch live public job results with company and duplicate matches. Does not import jobs. Requires confirm: true.",
    input: jobSearchInput,
    output: z.array(linkedInResultOutput),
    examples: [
      { title: "Search developers", input: { query: "Software Developer", confirm: true } },
    ],
    run: (_ctx, input) => searchLinkedInWithMatches(input),
  }),
  jobSearchImport: defineOperation({
    name: "jobSearchImport",
    area: "jobs",
    risk: "write",
    access: "admin",
    summary: "Import a reviewed search result as a manual job.",
    description:
      "Match companyName against the directory when supplied. Use title as description when omitted, and save a manual active job with normal slug and reference handling. This makes no network request. Set ifNotExists to return an existing record by canonical application URL. Existing records are unchanged and return created:false; new records return created:true. Directory names are never used as identities.",
    input: jobSearchImportInput,
    output: jobOutput.extend({ created: z.boolean() }).strict(),
    examples: [
      { title: "Import result", input: { title: "Developer", url: "https://example.com/jobs" } },
    ],
    run: (_ctx, { ifNotExists, ...input }) =>
      createIfAbsent(
        "job",
        ifNotExists,
        urlIdentity(input.url, getAllJobs, (row) => row.url),
        async () => {
          const { companyName, description, salary, isRemote, ...fields } = input;
          const company = companyName ? await getCompanyByName(companyName) : null;
          return toPlain(
            await createJob({
              ...fields,
              description: description ?? fields.title,
              companyId: company?.id ?? null,
              salaryRange: salary,
              workplaceType: isRemote ? "remote" : null,
            }),
          );
        },
      ),
  }),
  jobTechNLList: defineOperation({
    name: "jobTechNLList",
    area: "jobs",
    risk: "read",
    access: "admin",
    summary: "Read the live TechNL job board.",
    description:
      "Fetch the fixed TechNL feed and enrich postings with directory and existing-job matches. This read does not save jobs.",
    input: listInput(["postedAt", "title"]),
    output: techNLListOutput,
    examples: [{ title: "TechNL jobs", input: {} }],
    run: (_ctx, input) => getTechNLJobsPage(input),
  }),
  jobTechNLGet: defineOperation({
    name: "jobTechNLGet",
    area: "jobs",
    risk: "read",
    access: "admin",
    summary: "Get one live TechNL job.",
    description:
      "Find an exact posting link in the fixed TechNL feed. The supplied link is only a lookup key; it is never fetched.",
    input: z.object({ link: url() }).strict(),
    output: techNLJobOutput,
    examples: [{ title: "Find posting", input: { link: "https://technl.ca/job/example" } }],
    run: async (_ctx, input) => {
      const job = (await fetchTechNLJobsWithMatches()).jobs.find((job) => job.link === input.link);
      if (!job) throw new NotFoundError("TechNL job not found");
      return job;
    },
  }),
};
