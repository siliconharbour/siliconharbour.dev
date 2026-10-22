import { jobFormInput } from "~/lib/admin/content-form-adapters";
import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/new";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";

import { requireAdmin } from "~/lib/session.server";

import { db } from "~/db";
import { companies } from "~/db/schema";
import { asc } from "drizzle-orm";

import { actionError } from "~/lib/admin/action-result";
import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Job - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  // Get all companies for the dropdown
  const companyList = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));

  return { companies: companyList };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const result = await runAdminOperation(request, operationCatalog.jobCreate, {
    ...jobFormInput(form),
  });
  if (!result.ok) return actionError(result.error);
  return redirect("/manage/jobs");
}

export default function NewJob() {
  const { companies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/jobs" className="text-sm text-subtle hover:text-body">
            &larr; Back to Jobs
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">New Manual Job</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-gap-6">
          <ManageField label="Job Title *" htmlFor="title">
            <input
              type="text"
              id="title"
              name="title"
              required
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField
            label="Company"
            htmlFor="companyId"
            hint="Link to an existing company, or leave blank for external companies"
          >
            <select
              id="companyId"
              name="companyId"
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
                placeholder="e.g., St. John's, NL"
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
                placeholder="e.g., Engineering"
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
                placeholder="e.g., $80k-$100k"
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
              placeholder="https://..."
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <input type="hidden" name="isTechnicalPresent" value="true" />
          <label className="flex items-center gap-gap-2 text-sm text-body">
            <input type="checkbox" name="isTechnical" defaultChecked={true} />
            Technical role
          </label>
          <ManageSubmitButton>Create Job</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
