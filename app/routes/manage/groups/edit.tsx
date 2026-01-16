import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getGroupById, updateGroup } from "~/lib/groups.server";
import { processAndSaveCoverImage, processAndSaveIconImage, deleteImage } from "~/lib/images.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.group?.name || "Group"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid group ID", { status: 400 });
  }

  const group = await getGroupById(id);
  if (!group) {
    throw new Response("Group not found", { status: 404 });
  }

  return { group };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid group ID" };
  }

  const existingGroup = await getGroupById(id);
  if (!existingGroup) {
    return { error: "Group not found" };
  }

  const formData = await request.formData();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const website = (formData.get("website") as string) || null;
  const meetingFrequency = (formData.get("meetingFrequency") as string) || null;

  if (!name || !description) {
    return { error: "Name and description are required" };
  }

  let logo: string | null | undefined = undefined;
  let coverImage: string | null | undefined = undefined;

  const logoData = formData.get("logoData") as string | null;
  const coverImageData = formData.get("coverImageData") as string | null;
  const existingLogo = formData.get("existingLogo") as string | null;
  const existingCoverImage = formData.get("existingCoverImage") as string | null;

  if (logoData) {
    if (existingGroup.logo) await deleteImage(existingGroup.logo);
    const base64Data = logoData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    logo = await processAndSaveIconImage(buffer);
  } else if (existingLogo) {
    logo = existingLogo;
  } else if (existingGroup.logo) {
    await deleteImage(existingGroup.logo);
    logo = null;
  }

  if (coverImageData) {
    if (existingGroup.coverImage) await deleteImage(existingGroup.coverImage);
    const base64Data = coverImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    coverImage = await processAndSaveCoverImage(buffer);
  } else if (existingCoverImage) {
    coverImage = existingCoverImage;
  } else if (existingGroup.coverImage) {
    await deleteImage(existingGroup.coverImage);
    coverImage = null;
  }

  await updateGroup(id, {
    name,
    description,
    website,
    meetingFrequency,
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
          <Link
            to="/manage/groups"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Groups
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Group</h1>

        {actionData?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">
            {actionData.error}
          </div>
        )}

        <Form method="post" className="flex flex-col gap-6">
          <input type="hidden" name="existingLogo" value={group.logo ?? ""} />
          <input type="hidden" name="existingCoverImage" value={group.coverImage ?? ""} />

          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="font-medium text-harbour-700">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={group.name}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="font-medium text-harbour-700">
              Description * (Markdown)
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={8}
              defaultValue={group.description}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="website" className="font-medium text-harbour-700">
              Website
            </label>
            <input
              type="url"
              id="website"
              name="website"
              defaultValue={group.website ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="meetingFrequency" className="font-medium text-harbour-700">
              Meeting Frequency
            </label>
            <input
              type="text"
              id="meetingFrequency"
              name="meetingFrequency"
              placeholder="e.g., Monthly, First Tuesday"
              defaultValue={group.meetingFrequency ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Update Group
          </button>
        </Form>
      </div>
    </div>
  );
}
