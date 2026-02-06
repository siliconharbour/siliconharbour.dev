import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getTechnologyById,
  updateTechnology,
  categoryLabels,
  technologyCategories,
  getCompaniesUsingTechnology,
  getProjectsUsingTechnology,
} from "~/lib/technologies.server";
import { processAndSaveIconImage, deleteImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.technology?.name || "Technology"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid technology ID", { status: 400 });
  }

  const technology = await getTechnologyById(id);
  if (!technology) {
    throw new Response("Technology not found", { status: 404 });
  }

  const [companiesUsing, projectsUsing] = await Promise.all([
    getCompaniesUsingTechnology(id),
    getProjectsUsingTechnology(id),
  ]);

  return { technology, categories: technologyCategories, categoryLabels, companiesUsing, projectsUsing };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid technology ID" };
  }

  const existingTech = await getTechnologyById(id);
  if (!existingTech) {
    return { error: "Technology not found" };
  }

  const formData = await request.formData();

  const name = formData.get("name") as string;
  const category = formData.get("category") as string;
  const description = (formData.get("description") as string) || null;
  const website = (formData.get("website") as string) || null;
  const visible = formData.get("visible") === "true";

  if (!name || !category) {
    return { error: "Name and category are required" };
  }

  let icon: string | null | undefined = undefined;

  const iconData = formData.get("iconData") as string | null;
  const existingIcon = formData.get("existingIcon") as string | null;

  if (iconData) {
    if (existingTech.icon) await deleteImage(existingTech.icon);
    const base64Data = iconData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    icon = await processAndSaveIconImage(buffer);
  } else if (existingIcon) {
    icon = existingIcon;
  } else if (existingTech.icon) {
    await deleteImage(existingTech.icon);
    icon = null;
  }

  await updateTechnology(id, {
    name,
    category: category as any,
    description,
    website,
    visible,
    ...(icon !== undefined && { icon }),
  });

  return redirect("/manage/technologies");
}

export default function EditTechnology() {
  const { technology, companiesUsing, projectsUsing } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const usageCount = companiesUsing.length + projectsUsing.length;

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

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Technology</h1>

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
              defaultValue={technology.name}
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
              defaultValue={technology.category}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
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
              defaultValue={technology.description ?? ""}
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
              defaultValue={technology.website ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <ImageUpload
            label="Icon"
            name="iconData"
            existingName="existingIcon"
            aspect={1}
            existingImage={technology.icon}
            previewStyle="square"
            helpText="Upload icon (1:1, optional)"
          />

          <div className="flex flex-col gap-2">
            <span className="font-medium text-harbour-700">Visibility</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="visible"
                value="true"
                defaultChecked={technology.visible ?? true}
                className="rounded"
              />
              <span className="text-sm text-harbour-600">Visible on public site</span>
            </label>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Update Technology
          </button>
        </Form>

        {/* Usage section */}
        {usageCount > 0 && (
          <div className="border-t border-harbour-200 pt-6">
            <h2 className="font-medium text-harbour-700 mb-3">
              Used by {usageCount} {usageCount === 1 ? "entity" : "entities"}
            </h2>

            {companiesUsing.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm text-harbour-500 mb-2">Companies ({companiesUsing.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {companiesUsing.map((company) => (
                    <Link
                      key={company.id}
                      to={`/manage/companies/${company.id}`}
                      className="text-sm px-2 py-1 bg-harbour-100 text-harbour-600 hover:bg-harbour-200 transition-colors"
                    >
                      {company.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {projectsUsing.length > 0 && (
              <div>
                <h3 className="text-sm text-harbour-500 mb-2">Projects ({projectsUsing.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {projectsUsing.map((project) => (
                    <Link
                      key={project.id}
                      to={`/manage/projects/${project.id}`}
                      className="text-sm px-2 py-1 bg-harbour-100 text-harbour-600 hover:bg-harbour-200 transition-colors"
                    >
                      {project.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Delete link */}
        <div className="border-t border-harbour-200 pt-6">
          <Link
            to={`/manage/technologies/${technology.id}/delete`}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Delete this technology
          </Link>
        </div>
      </div>
    </div>
  );
}
