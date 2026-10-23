import { createIfAbsent, urlIdentity } from "../creation.server";
import { page, pageResult } from "../listing";
import { jobListItemOutput } from "../contracts/jobs";
import { getPaginatedJobs } from "~/lib/jobs.server";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError, ConflictError } from "../errors";
import { toPlain } from "../plain";
import { lookupInput, deleteInput } from "../fields";
import { jobCreateInput, jobUpdateInput, jobListInput, jobOutput } from "../contracts/jobs";
import { createJob, updateJob, deleteJob, getJobById, getAllJobs } from "~/lib/jobs.server";
import { getCompanyById, getCompanyByName } from "~/lib/companies.server";
export async function requireJob(id: number) {
  const job = await getJobById(id);
  if (!job) throw new NotFoundError("Job not found");
  return job;
}
async function validateCompany(id: number | null | undefined) {
  if (id && !(await getCompanyById(id))) throw new NotFoundError("Company not found");
}
export const jobOperations = {
  jobList: defineOperation({
    name: "jobList",
    area: "jobs",
    risk: "read",
    access: "admin",
    summary: "List jobs for administration.",
    description:
      "Return a bounded page, including hidden, nontechnical, and imported jobs. Filter by title, status, company, source, or technical classification.",
    input: jobListInput,
    output: page(jobListItemOutput),
    examples: [{ title: "Pending jobs", input: { status: "pending_review" } }],
    run: async (_ctx, input) => {
      const result = await getPaginatedJobs(input.limit, input.offset, input.query, {
        includeNonTechnical: true,
        companyId: input.companyId,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        status: input.status ?? "all",
        isTechnical: input.isTechnical,
        workplaceType: input.workplaceType,
        location: input.location,
        lastSeenAfter: input.lastSeenAfter ? new Date(input.lastSeenAfter) : undefined,
        sort: input.sort,
        order: input.order,
      });
      return toPlain(pageResult(input, result.items, result.total));
    },
  }),
  jobGet: defineOperation({
    name: "jobGet",
    area: "jobs",
    risk: "read",
    access: "admin",
    summary: "Get one job.",
    description:
      "Look up a manual or imported job by ID, slug, or exact title, including hidden records.",
    input: lookupInput,
    output: jobOutput,
    examples: [{ title: "By ID", input: { id: 1 } }],
    run: async (_ctx, input) => {
      const row = input.id
        ? await getJobById(input.id)
        : (await getAllJobs()).find((row) =>
            input.slug
              ? row.slug === input.slug
              : row.title.toLowerCase() === input.name?.toLowerCase(),
          );
      if (!row) throw new NotFoundError("Job not found");
      return toPlain(row);
    },
  }),
  jobCreate: defineOperation({
    name: "jobCreate",
    area: "jobs",
    risk: "write",
    access: "admin",
    summary: "Create a manual job.",
    description:
      "Create an active manual posting, derive its slug, and synchronize references. Resolve optional companyName when companyId is omitted. isTechnical defaults to true. Set ifNotExists to return an existing record by canonical application URL. Existing records are unchanged and return created:false; new records return created:true.",
    input: jobCreateInput,
    output: jobOutput.extend({ created: z.boolean() }).strict(),
    examples: [
      {
        title: "Create job",
        input: {
          title: "Developer",
          description: "Build software",
          url: "https://example.com/jobs",
        },
      },
    ],
    run: (_ctx, { ifNotExists, ...input }) =>
      createIfAbsent(
        "job",
        ifNotExists,
        urlIdentity(input.url, getAllJobs, (row) => row.url),
        async () => {
          const { companyName, ...fields } = input;
          let companyId = fields.companyId;
          if (companyId === undefined && companyName) {
            const company = await getCompanyByName(companyName);
            if (!company) throw new NotFoundError("Company not found");
            companyId = company.id;
          }
          await validateCompany(companyId);
          return toPlain(await createJob({ ...fields, companyId }));
        },
      ),
  }),
  jobUpdate: defineOperation({
    name: "jobUpdate",
    area: "jobs",
    risk: "write",
    access: "admin",
    summary: "Update a manual job.",
    description:
      "Patch supplied fields, regenerate the slug on title changes, and synchronize references. Imported jobs reject field edits because the next sync overwrites them; jobHide, jobMarkTechnical, jobMarkNonTechnical, jobApprove, and jobDeactivate still work.",
    input: jobUpdateInput,
    output: jobOutput,
    examples: [{ title: "Rename", input: { id: 1, title: "Senior Developer" } }],
    run: async (_ctx, { id, ...fields }) => {
      const job = await requireJob(id);
      if (job.sourceType !== "manual")
        throw new ConflictError(
          "Cannot edit imported jobs; they are overwritten on the next sync. Use jobHide, jobApprove, jobMarkTechnical, jobMarkNonTechnical or jobDeactivate.",
        );
      await validateCompany(fields.companyId);
      return toPlain((await updateJob(id, fields))!);
    },
  }),
  jobDelete: defineOperation({
    name: "jobDelete",
    area: "jobs",
    risk: "destructive",
    access: "admin",
    summary: "Delete a job permanently.",
    description:
      "Hard-delete a manual or imported job. Use jobHide to preserve it. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true), record: jobOutput }).strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => {
      const record = await requireJob(id);
      await deleteJob(id);
      return { deleted: true as const, record: toPlain(record) };
    },
  }),
};
