import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/session.server";
import { getGroupById, updateGroup } from "~/lib/groups.server";
import {
  processAndSaveCoverImage,
  processAndSaveIconImage,
} from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { parseIdOrError, parseIdOrThrow } from "~/lib/admin/route";
import { parseFormData, zOptionalNullableString, zRequiredString, zTrueBoolean } from "~/lib/admin/form";
import { actionError } from "~/lib/admin/action-result";
import { resolveUpdatedImage } from "~/lib/admin/image-fields";
import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.group?.name || "Group"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "group");

  const group = await getGroupById(id);
  if (!group) {
    throw new Response("Group not found", { status: 404 });
  }

  return { group };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const parsedId = parseIdOrError(params.id, "group");
  if ("error" in parsedId) return parsedId;
  const id = parsedId.id;

  const existingGroup = await getGroupById(id);
  if (!existingGroup) {
    return actionError("Group not found");
  }

  const formData = await request.formData();
  const schema = z.object({
    name: zRequiredString("Name"),
    description: zOptionalNullableString,
    website: zOptionalNullableString,
    meetingFrequency: zOptionalNullableString,
    visible: zTrueBoolean,
  });
  const parsed = parseFormData(formData, schema);
  if (!parsed.success) {
    return actionError(parsed.error);
  }

  const logo = await resolveUpdatedImage({
    formData,
    uploadedImageField: "logoData",
    existingImageField: "existingLogo",
    currentImage: existingGroup.logo,
    processor: processAndSaveIconImage,
  });

  const coverImage = await resolveUpdatedImage({
    formData,
    uploadedImageField: "coverImageData",
    existingImageField: "existingCoverImage",
    currentImage: existingGroup.coverImage,
    processor: processAndSaveCoverImage,
  });

  await updateGroup(id, {
    name: parsed.data.name,
    description: parsed.data.description,
    website: parsed.data.website,
    meetingFrequency: parsed.data.meetingFrequency,
    visible: parsed.data.visible,
    ...(logo !== undefined && { logo }),
    ...(coverImage !== undefined && { coverImage }),
  });

  return redirect("/manage/groups");
}

export default function EditGroup() {
  const { group } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/groups" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Groups
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Group</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-6">
          <ManageField label="Name *" htmlFor="name">
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={group.name}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Description (Markdown)" htmlFor="description">
            <textarea
              id="description"
              name="description"
              rows={8}
              defaultValue={group.description ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <ManageField label="Website" htmlFor="website">
            <input
              type="url"
              id="website"
              name="website"
              defaultValue={group.website ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Meeting Frequency" htmlFor="meetingFrequency">
            <input
              type="text"
              id="meetingFrequency"
              name="meetingFrequency"
              placeholder="e.g., Monthly, First Tuesday"
              defaultValue={group.meetingFrequency ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          <div className="flex flex-col gap-2">
            <span className="font-medium text-harbour-700">Visibility</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="visible"
                value="true"
                defaultChecked={group.visible ?? true}
                className="border border-harbour-300"
              />
              <span className="text-sm text-harbour-600">Visible on public site</span>
            </label>
            <p className="text-xs text-harbour-400">
              Uncheck to hide this group from public listings while you review/edit their profile.
            </p>
          </div>

          <ManageSubmitButton>Update Group</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
