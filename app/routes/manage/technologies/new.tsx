import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { createTechnology } from "~/lib/technologies.server";
import { categoryLabels, technologyCategories } from "~/lib/technology-categories";
import { processAndSaveIconImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Technology - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return { categories: technologyCategories, categoryLabels };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();

  const name = formData.get("name") as string;
  const category = formData.get("category") as string;
  const description = (formData.get("description") as string) || null;
  const website = (formData.get("website") as string) || null;

  if (!name || !category) {
    return { error: "Name and category are required" };
  }

  let icon: string | null = null;
  const iconData = formData.get("iconData") as string | null;

  if (iconData) {
    const base64Data = iconData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    icon = await processAndSaveIconImage(buffer);
  }

  await createTechnology({
    name,
    category: category as any,
    description,
    website,
    icon,
  });

  return redirect("/manage/technologies");
}

export default function NewTechnology() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage/technologies"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Technologies
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Technology</h1>

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
              placeholder="e.g., React, AWS, Python"
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="category" className="font-medium text-harbour-700">
              Category *
            </label>
            <select
              id="category"
              name="category"
              required
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              <option value="">Select a category...</option>
              {technologyCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabels[cat]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="font-medium text-harbour-700">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Optional description for tooltips/details"
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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
              placeholder="Official docs or homepage URL"
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <ImageUpload
            label="Icon"
            name="iconData"
            aspect={1}
            previewStyle="square"
            helpText="Upload icon (1:1, optional)"
          />

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Create Technology
          </button>
        </Form>
      </div>
    </div>
  );
}
