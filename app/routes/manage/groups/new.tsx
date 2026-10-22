import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";

import { requireAdmin } from "~/lib/session.server";

import { ImageUpload } from "~/components/ImageUpload";

import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Group - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();

  const result = await runAdminOperation(request, operationCatalog.groupCreate, {
    ...directoryFormInput("group", form, false),
  });
  if (!result.ok) return { error: result.error };
  return redirect("/manage/groups");
}

export default function NewGroup() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/groups" className="text-sm text-subtle hover:text-body">
            &larr; Back to Groups
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">New Group</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-gap-6">
          <ManageField label="Name *" htmlFor="name">
            <input
              type="text"
              id="name"
              name="name"
              required
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Description * (Markdown)" htmlFor="description">
            <textarea
              id="description"
              name="description"
              required
              rows={8}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <ManageField label="Website" htmlFor="website">
            <input
              type="url"
              id="website"
              name="website"
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Meeting Frequency" htmlFor="meetingFrequency">
            <input
              type="text"
              id="meetingFrequency"
              name="meetingFrequency"
              placeholder="e.g., Monthly, First Tuesday"
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

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

          <ManageSubmitButton>Create Group</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
