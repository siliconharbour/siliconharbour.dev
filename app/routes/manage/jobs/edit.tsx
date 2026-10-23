import {
  loadAllAdminItems,
  loadAdminOperation,
  runAdminOperation,
} from "~/lib/admin/run-operation.server";
import { jobFormInput } from "~/lib/admin/content-form-adapters";
import { operationCatalog } from "~/operations/catalog";

import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";

import { requireAdmin } from "~/lib/session.server";

import { parseIdOrThrow } from "~/lib/admin/route";
import { actionError } from "~/lib/admin/action-result";

import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.job?.title || "Job"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "job");

  const job = await loadAdminOperation(request, operationCatalog.jobGet, { id });

  // Only allow editing manual jobs
  if (job.sourceType !== "manual") {
    throw new Response("Cannot edit imported jobs", { status: 403 });
  }

  const companyList = await loadAllAdminItems(request, operationCatalog.companyList, {
    sort: "name",
    order: "asc",
  });

  return { job, companies: companyList };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const result = await runAdminOperation(request, operationCatalog.jobUpdate, {
    id: Number(params.id),
    ...jobFormInput(form),
  });
  if (!result.ok) return actionError(result.error);
  return redirect("/manage/jobs");
}

export default function EditJob() {
  const { job, companies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/jobs" className="text-sm text-subtle hover:text-body">
            &larr; Back to Jobs
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">Edit Job</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-gap-6">
          <ManageField label="Job Title *" htmlFor="title">
            <input
              type="text"
              id="title"
              name="title"
              required
              defaultValue={job.title}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Company" htmlFor="companyId">
            <select
              id="companyId"
              name="companyId"
              defaultValue={job.companyId ?? ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
            <div className="flex flex-col gap-gap-2">
              <label htmlFor="location" className="font-medium text-heading">
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                defaultValue={job.location ?? ""}
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-gap-2">
              <label htmlFor="department" className="font-medium text-heading">
                Department
              </label>
              <input
                type="text"
                id="department"
                name="department"
                defaultValue={job.department ?? ""}
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
            <div className="flex flex-col gap-gap-2">
              <label htmlFor="workplaceType" className="font-medium text-heading">
                Workplace Type
              </label>
              <select
                id="workplaceType"
                name="workplaceType"
                defaultValue={job.workplaceType ?? ""}
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                <option value="">-- Select --</option>
                <option value="onsite">On-site</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div className="flex flex-col gap-gap-2">
              <label htmlFor="salaryRange" className="font-medium text-heading">
                Salary Range
              </label>
              <input
                type="text"
                id="salaryRange"
                name="salaryRange"
                defaultValue={job.salaryRange ?? ""}
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <input type="hidden" name="isTechnicalPresent" value="true" />
          <label className="flex items-center gap-gap-2 text-sm text-body">
            <input type="checkbox" name="isTechnical" defaultChecked={job.isTechnical ?? true} />
            Technical role
          </label>
          <ManageSubmitButton>Update Job</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
