import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/session.server";
import { getJobById, updateJob } from "~/lib/jobs.server";
import { db } from "~/db";
import { companies } from "~/db/schema";
import { asc } from "drizzle-orm";
import { parseIdOrError, parseIdOrThrow } from "~/lib/admin/route";
import { actionError } from "~/lib/admin/action-result";
import { parseFormData, zOptionalNullableString, zRequiredString } from "~/lib/admin/form";
import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.job?.title || "Job"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "job");

  const job = await getJobById(id);
  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  // Only allow editing manual jobs
  if (job.sourceType !== "manual") {
    throw new Response("Cannot edit imported jobs", { status: 403 });
  }

  // Get all companies for the dropdown
  const companyList = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));

  return { job, companies: companyList };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const parsedId = parseIdOrError(params.id, "job");
  if ("error" in parsedId) {
    return parsedId;
  }
  const id = parsedId.id;

  const existing = await getJobById(id);
  if (!existing) {
    return actionError("Job not found");
  }

  if (existing.sourceType !== "manual") {
    return actionError("Cannot edit imported jobs");
  }

  const formData = await request.formData();
  const schema = z.object({
    title: zRequiredString("Title"),
    description: zRequiredString("Description"),
    companyId: zOptionalNullableString,
    location: zOptionalNullableString,
    department: zOptionalNullableString,
    workplaceType: z.enum(["remote", "onsite", "hybrid"]).nullable(),
    salaryRange: zOptionalNullableString,
    url: zRequiredString("Apply link").url("Apply link must be a valid URL"),
  });
  const parsed = parseFormData(formData, schema);
  if (!parsed.success) {
    return actionError(parsed.error);
  }

  const companyId = parsed.data.companyId ? Number.parseInt(parsed.data.companyId, 10) : null;

  await updateJob(id, {
    title: parsed.data.title,
    description: parsed.data.description,
    companyId: companyId || null,
    location: parsed.data.location,
    department: parsed.data.department,
    workplaceType: parsed.data.workplaceType,
    salaryRange: parsed.data.salaryRange,
    url: parsed.data.url,
  });

  return redirect("/manage/jobs");
}

export default function EditJob() {
  const { job, companies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/jobs" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Jobs
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Job</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-6">
          <ManageField label="Job Title *" htmlFor="title">
            <input
              type="text"
              id="title"
              name="title"
              required
              defaultValue={job.title}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Company" htmlFor="companyId">
            <select
              id="companyId"
              name="companyId"
              defaultValue={job.companyId ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              <option value="">-- Select a company (optional) --</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </ManageField>

          <ManageField label="Description * (Markdown)" htmlFor="description">
            <textarea
              id="description"
              name="description"
              required
              rows={10}
              defaultValue={job.description ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="location" className="font-medium text-harbour-700">
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                defaultValue={job.location ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="department" className="font-medium text-harbour-700">
                Department
              </label>
              <input
                type="text"
                id="department"
                name="department"
                defaultValue={job.department ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="workplaceType" className="font-medium text-harbour-700">
                Workplace Type
              </label>
              <select
                id="workplaceType"
                name="workplaceType"
                defaultValue={job.workplaceType ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                <option value="">-- Select --</option>
                <option value="onsite">On-site</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="salaryRange" className="font-medium text-harbour-700">
                Salary Range
              </label>
              <input
                type="text"
                id="salaryRange"
                name="salaryRange"
                defaultValue={job.salaryRange ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <ManageField label="Apply Link *" htmlFor="url">
            <input
              type="url"
              id="url"
              name="url"
              required
              defaultValue={job.url ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageSubmitButton>Update Job</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
