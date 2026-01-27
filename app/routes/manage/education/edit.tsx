import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getEducationById, updateEducation } from "~/lib/education.server";
import {
  processAndSaveCoverImage,
  processAndSaveIconImage,
  deleteImage,
} from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.institution?.name || "Institution"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid ID", { status: 400 });
  }

  const institution = await getEducationById(id);
  if (!institution) {
    throw new Response("Institution not found", { status: 404 });
  }

  return { institution };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid ID" };
  }

  const existing = await getEducationById(id);
  if (!existing) {
    return { error: "Institution not found" };
  }

  const formData = await request.formData();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const website = (formData.get("website") as string) || null;
  const type = (formData.get("type") as string) || "other";
  const technl = formData.get("technl") === "on";
  const genesis = formData.get("genesis") === "on";
  const visible = formData.get("visible") === "true";

  if (!name) {
    return { error: "Name is required" };
  }

  let logo: string | null | undefined = undefined;
  let coverImage: string | null | undefined = undefined;

  const logoData = formData.get("logoData") as string | null;
  const coverImageData = formData.get("coverImageData") as string | null;
  const existingLogo = formData.get("existingLogo") as string | null;
  const existingCoverImage = formData.get("existingCoverImage") as string | null;

  if (logoData) {
    if (existing.logo) await deleteImage(existing.logo);
    const base64Data = logoData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    logo = await processAndSaveIconImage(buffer);
  } else if (existingLogo) {
    logo = existingLogo;
  } else if (existing.logo) {
    await deleteImage(existing.logo);
    logo = null;
  }

  if (coverImageData) {
    if (existing.coverImage) await deleteImage(existing.coverImage);
    const base64Data = coverImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    coverImage = await processAndSaveCoverImage(buffer);
  } else if (existingCoverImage) {
    coverImage = existingCoverImage;
  } else if (existing.coverImage) {
    await deleteImage(existing.coverImage);
    coverImage = null;
  }

  await updateEducation(id, {
    name,
    description,
    website,
    type: type as "university" | "college" | "bootcamp" | "online" | "other",
    technl,
    genesis,
    visible,
    ...(logo !== undefined && { logo }),
    ...(coverImage !== undefined && { coverImage }),
  });

  return redirect("/manage/education");
}

export default function EditEducation() {
  const { institution } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/education" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Education
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Institution</h1>

        {actionData?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">{actionData.error}</div>
        )}

        <Form method="post" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="font-medium text-harbour-700">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={institution.name}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="font-medium text-harbour-700">
              Description (Markdown)
            </label>
            <textarea
              id="description"
              name="description"
              rows={8}
              defaultValue={institution.description ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="type" className="font-medium text-harbour-700">
              Type
            </label>
            <select
              id="type"
              name="type"
              defaultValue={institution.type}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              <option value="university">University</option>
              <option value="college">College</option>
              <option value="bootcamp">Bootcamp</option>
              <option value="online">Online</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="website" className="font-medium text-harbour-700">
              Website
            </label>
            <input
              type="url"
              id="website"
              name="website"
              defaultValue={institution.website ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ImageUpload
              label="Logo"
              name="logoData"
              existingName="existingLogo"
              aspect={1}
              existingImage={institution.logo}
              previewStyle="square"
              helpText="Upload logo (1:1)"
            />
            <ImageUpload
              label="Cover Image"
              name="coverImageData"
              existingName="existingCoverImage"
              aspect={16 / 9}
              existingImage={institution.coverImage}
              previewStyle="cover"
              helpText="Upload cover (16:9)"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium text-harbour-700">Directory Listings</span>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="technl"
                  defaultChecked={institution.technl ?? false}
                  className="rounded"
                />
                <span className="text-sm text-harbour-600">TechNL Member</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="genesis"
                  defaultChecked={institution.genesis ?? false}
                  className="rounded"
                />
                <span className="text-sm text-harbour-600">Genesis Centre</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium text-harbour-700">Visibility</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="visible"
                value="true"
                defaultChecked={institution.visible ?? true}
                className="rounded"
              />
              <span className="text-sm text-harbour-600">Visible on public site</span>
            </label>
            <p className="text-xs text-harbour-400">
              Uncheck to hide this institution from public listings while you review/edit their
              profile.
            </p>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Update Institution
          </button>
        </Form>
      </div>
    </div>
  );
}
