import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import {
  getTechnologyById,
  updateTechnology,
  getCompaniesUsingTechnology,
  getProjectsUsingTechnology,
} from "~/lib/technologies.server";
import { categoryLabels, technologyCategories } from "~/lib/technology-categories";
import { processAndSaveIconImage, deleteImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.technology?.name || "Technology"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

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

  return {
    technology,
    categories: technologyCategories,
    categoryLabels,
    companiesUsing,
    projectsUsing,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);

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
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/technologies" className="text-sm text-subtle hover:text-body">
            &larr; Back to Technologies
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">Edit Technology</h1>

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
              defaultValue={technology.name}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="category" className="font-medium text-heading">
              Category *
            </label>
            <select
              id="category"
              name="category"
              required
              defaultValue={technology.category}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            >
              {technologyCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabels[cat]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-gap-2">
            <label htmlFor="description" className="font-medium text-heading">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={technology.description ?? ""}
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
              defaultValue={technology.website ?? ""}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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

          <div className="flex flex-col gap-gap-2">
            <span className="font-medium text-heading">Visibility</span>
            <label className="flex items-center gap-gap-2">
              <input
                type="checkbox"
                name="visible"
                value="true"
                defaultChecked={technology.visible ?? true}
                className="border border-harbour-300"
              />
              <span className="text-sm text-body">Visible on public site</span>
            </label>
          </div>

          <button
            type="submit"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors self-start"
          >
            Update Technology
          </button>
        </Form>

        {/* Usage section */}
        {usageCount > 0 && (
          <div className="border-t border-line pt-pad-6">
            <h2 className="font-medium text-heading mb-3">
              Used by {usageCount} {usageCount === 1 ? "entity" : "entities"}
            </h2>

            {companiesUsing.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm text-muted mb-2">Companies ({companiesUsing.length})</h3>
                <div className="flex flex-wrap gap-gap-2">
                  {companiesUsing.map((company) => (
                    <Link
                      key={company.id}
                      to={`/manage/companies/${company.id}`}
                      className="text-sm px-pad-2 py-pad-1 bg-tint text-body hover:bg-harbour-200 transition-colors"
                    >
                      {company.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {projectsUsing.length > 0 && (
              <div>
                <h3 className="text-sm text-muted mb-2">Projects ({projectsUsing.length})</h3>
                <div className="flex flex-wrap gap-gap-2">
                  {projectsUsing.map((project) => (
                    <Link
                      key={project.id}
                      to={`/manage/projects/${project.id}`}
                      className="text-sm px-pad-2 py-pad-1 bg-tint text-body hover:bg-harbour-200 transition-colors"
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
        <div className="border-t border-line pt-pad-6">
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
