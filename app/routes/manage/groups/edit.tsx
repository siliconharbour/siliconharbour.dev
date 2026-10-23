import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";

import { requireAdmin } from "~/lib/session.server";
import { getGroupById } from "~/lib/groups.server";

import { ImageUpload } from "~/components/ImageUpload";
import { parseIdOrThrow } from "~/lib/admin/route";

import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.group?.name || "Group"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "group");

  const group = await getGroupById(id);
  if (!group) {
    throw new Response("Group not found", { status: 404 });
  }

  return { group };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();

  const result = await runAdminOperation(request, operationCatalog.groupUpdate, {
    id: Number(params.id),
    ...directoryFormInput("group", form, true),
  });
  if (!result.ok) return { error: result.error };
  return redirect("/manage/groups");
}

export default function EditGroup() {
  const { group } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/groups" className="text-sm text-subtle hover:text-body">
            &larr; Back to Groups
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">Edit Group</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-gap-6">
          <ManageField label="Name *" htmlFor="name">
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={group.name}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Description (Markdown)" htmlFor="description">
            <textarea
              id="description"
              name="description"
              rows={8}
              defaultValue={group.description ?? ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <ManageField label="Website" htmlFor="website">
            <input
              type="url"
              id="website"
              name="website"
              defaultValue={group.website ?? ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Meeting Frequency" htmlFor="meetingFrequency">
            <input
              type="text"
              id="meetingFrequency"
              name="meetingFrequency"
              placeholder="e.g., Monthly, First Tuesday"
              defaultValue={group.meetingFrequency ?? ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-6">
            <ImageUpload
              label="Logo"
              name="logoData"
              existingName="existingLogo"
              aspect={1}
              existingImage={group.logo}
              previewStyle="square"
              helpText="Upload logo (1:1)"
            />
            <ImageUpload
              label="Cover Image"
              name="coverImageData"
              existingName="existingCoverImage"
              aspect={16 / 9}
              existingImage={group.coverImage}
              previewStyle="cover"
              helpText="Upload cover (16:9)"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <span className="font-medium text-heading">Visibility</span>
            <label className="flex items-center gap-gap-2">
              <input
                type="checkbox"
                name="visible"
                value="true"
                defaultChecked={group.visible ?? true}
                className="border border-harbour-300"
              />
              <span className="text-sm text-body">Visible on public site</span>
            </label>
            <p className="text-xs text-subtle">
              Uncheck to hide this group from public listings while you review/edit their profile.
            </p>
          </div>

          <ManageSubmitButton>Update Group</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
