import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { ImageUpload } from "~/components/ImageUpload";

import { ManageErrorAlert } from "~/components/manage/ManageForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Company - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();

  const result = await runAdminOperation(request, operationCatalog.companyCreate, {
    ...directoryFormInput("company", form, false),
  });
  if (!result.ok) return { error: result.error };
  return redirect("/manage/companies");
}

export default function NewCompany() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/companies" className="text-sm text-subtle hover:text-body">
            &larr; Back to Companies
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">New Company</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-gap-6">
          <div className="flex flex-col gap-gap-2">
            <label htmlFor="name" className="font-medium text-heading">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="description" className="font-medium text-heading">
              Description * (Markdown)
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={8}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="email" className="font-medium text-heading">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-gap-2">
            <label htmlFor="careersUrl" className="font-medium text-heading">
              Careers URL
            </label>
            <input
              type="url"
              id="careersUrl"
              name="careersUrl"
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-gap-2">
            <label htmlFor="website" className="font-medium text-heading">
              Website
            </label>
            <input
              type="url"
              id="website"
              name="website"
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="wikipedia" className="font-medium text-heading">
              Wikipedia
            </label>
            <input
              type="url"
              id="wikipedia"
              name="wikipedia"
              placeholder="https://en.wikipedia.org/wiki/..."
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="github" className="font-medium text-heading">
              GitHub Organization
            </label>
            <input
              type="url"
              id="github"
              name="github"
              placeholder="https://github.com/org-name"
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="linkedin" className="font-medium text-heading">
              LinkedIn
            </label>
            <input
              type="url"
              id="linkedin"
              name="linkedin"
              placeholder="https://www.linkedin.com/company/..."
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
            <div className="flex flex-col gap-gap-2">
              <label htmlFor="location" className="font-medium text-heading">
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-gap-2">
              <label htmlFor="founded" className="font-medium text-heading">
                Founded
              </label>
              <input
                type="text"
                id="founded"
                name="founded"
                placeholder="e.g., 2015"
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-6">
            <ImageUpload
              label="Logo"
              name="logoData"
              aspect={1}
              previewStyle="square"
              helpText="Upload logo (1:1)"
            />
            <ImageUpload
              label="Cover Image"
              name="coverImageData"
              aspect={16 / 9}
              previewStyle="cover"
              helpText="Upload cover (16:9)"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <span className="font-medium text-heading">Directory Listings</span>
            <div className="flex gap-gap-6">
              <label className="flex items-center gap-gap-2">
                <input type="checkbox" name="technl" className="border border-harbour-300" />
                <span className="text-sm text-body">TechNL Member</span>
              </label>
              <label className="flex items-center gap-gap-2">
                <input type="checkbox" name="genesis" className="border border-harbour-300" />
                <span className="text-sm text-body">Genesis Centre</span>
              </label>
              <label className="flex items-center gap-gap-2">
                <input type="checkbox" name="bounce" className="border border-harbour-300" />
                <span className="text-sm text-body">Bounce</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-gap-2">
            <span className="font-medium text-heading">News Filtering</span>
            <label className="flex items-center gap-gap-2">
              <input
                type="checkbox"
                name="newsFilterInclude"
                className="border border-harbour-300"
              />
              <span className="text-sm text-body">Include name in news import keyword filter</span>
            </label>
            <p className="text-xs text-subtle">
              When a news source enables the company name filter, articles mentioning this
              company&rsquo;s name will be imported. Only enable for companies with distinctive
              names.
            </p>
          </div>

          <button
            type="submit"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors self-start"
          >
            Create Company
          </button>
        </Form>
      </div>
    </div>
  );
}
