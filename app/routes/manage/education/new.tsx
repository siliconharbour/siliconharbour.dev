import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { ImageUpload } from "~/components/ImageUpload";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Education Institution - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();

  const result = await runAdminOperation(request, operationCatalog.educationCreate, {
    ...directoryFormInput("education", form, false),
  });
  if (!result.ok) return { error: result.error };
  return redirect("/manage/education");
}

export default function NewEducation() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/education" className="text-sm text-subtle hover:text-body">
            &larr; Back to Education
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">New Education Institution</h1>

        {actionData?.error && (
          <div className="p-pad-4 bg-red-50 border border-red-200 text-red-600">
            {actionData.error}
          </div>
        )}

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
            <label htmlFor="type" className="font-medium text-heading">
              Type
            </label>
            <select
              id="type"
              name="type"
              defaultValue="other"
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              <option value="university">University</option>
              <option value="college">College</option>
              <option value="bootcamp">Bootcamp</option>
              <option value="online">Online</option>
              <option value="other">Other</option>
            </select>
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

          <button
            type="submit"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors self-start"
          >
            Create Institution
          </button>
        </Form>
      </div>
    </div>
  );
}
