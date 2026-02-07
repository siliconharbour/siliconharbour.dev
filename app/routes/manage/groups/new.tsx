import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/session.server";
import { createGroup } from "~/lib/groups.server";
import { processAndSaveCoverImage, processAndSaveIconImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { parseFormData, zOptionalNullableString, zRequiredString } from "~/lib/admin/form";
import { actionError } from "~/lib/admin/action-result";
import { createImageFromFormData } from "~/lib/admin/image-fields";
import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Group - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const schema = z.object({
    name: zRequiredString("Name"),
    description: zRequiredString("Description"),
    website: zOptionalNullableString,
    meetingFrequency: zOptionalNullableString,
  });
  const parsed = parseFormData(formData, schema);
  if (!parsed.success) {
    return actionError(parsed.error);
  }

  const logo = await createImageFromFormData(formData, "logoData", processAndSaveIconImage);
  const coverImage = await createImageFromFormData(
    formData,
    "coverImageData",
    processAndSaveCoverImage,
  );

  await createGroup({
    name: parsed.data.name,
    description: parsed.data.description,
    website: parsed.data.website,
    meetingFrequency: parsed.data.meetingFrequency,
    logo,
    coverImage,
  });

  return redirect("/manage/groups");
}

export default function NewGroup() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/groups" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Groups
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Group</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-6">
          <ManageField label="Name *" htmlFor="name">
            <input
              type="text"
              id="name"
              name="name"
              required
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Description * (Markdown)" htmlFor="description">
            <textarea
              id="description"
              name="description"
              required
              rows={8}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <ManageField label="Website" htmlFor="website">
            <input
              type="url"
              id="website"
              name="website"
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Meeting Frequency" htmlFor="meetingFrequency">
            <input
              type="text"
              id="meetingFrequency"
              name="meetingFrequency"
              placeholder="e.g., Monthly, First Tuesday"
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
