import { ProjectGalleryEditor } from "~/components/manage/ProjectGalleryEditor";
import {
  loadAdminOperation,
  loadAllAdminItems,
  runAdminOperation,
} from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { ImageUpload } from "~/components/ImageUpload";
import { TechnologySelect } from "~/components/TechnologySelect";
import { projectTypes, projectStatuses } from "~/db/schema";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.project?.name || "Project"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid project ID", { status: 400 });
  }

  const project = await loadAdminOperation(request, operationCatalog.projectGet, { id });

  const allTechnologies = await loadAllAdminItems(request, operationCatalog.technologyList, {
    sort: "name",
    order: "asc",
  });
  const projectTechnologies = project.technologies;

  return {
    project,
    allTechnologies,
    selectedTechnologyIds: projectTechnologies.map((t) => t.technologyId),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get("intent") === "updateGalleryImage") {
    const result = await runAdminOperation(request, operationCatalog.projectGalleryUpdate, {
      id: Number(params.id),
      imageId: Number(form.get("imageId")),
      caption: form.get("caption"),
    });
    return result.ok ? { success: true } : { error: result.error };
  }
  if (form.get("intent") === "reorderGallery") {
    const result = await runAdminOperation(request, operationCatalog.projectGalleryReorder, {
      id: Number(params.id),
      imageIds: form.getAll("imageIds").map(Number),
    });
    return result.ok ? { success: true } : { error: result.error };
  }
  if (form.get("intent") === "addGalleryImage") {
    const result = await runAdminOperation(request, operationCatalog.projectGalleryAdd, {
      id: Number(params.id),
      image: { kind: "dataUrl", confirm: true, dataUrl: form.get("galleryImageData") },
      caption: form.get("caption") || null,
    });
    return result.ok ? { success: true } : { error: result.error };
  }
  if (form.get("intent") === "removeGalleryImage") {
    const result = await runAdminOperation(request, operationCatalog.projectGalleryRemove, {
      id: Number(params.id),
      imageId: Number(form.get("imageId")),
      confirm: true,
    });
    return result.ok ? { success: true } : { error: result.error };
  }
  const result = await runAdminOperation(request, operationCatalog.projectUpdate, {
    id: Number(params.id),
    ...directoryFormInput("project", form, true),
  });
  if (!result.ok) return { error: result.error };
  return redirect("/manage/projects");
}

const typeLabels: Record<string, string> = {
  game: "Game",
  webapp: "Web App",
  library: "Library",
  tool: "Tool",
  hardware: "Hardware",
  other: "Other",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
  "on-hold": "On Hold",
};

export default function EditProject() {
  const { project, allTechnologies, selectedTechnologyIds } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const links = project.links ?? {};

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/projects" className="text-sm text-subtle hover:text-body">
            &larr; Back to Projects
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">Edit Project</h1>

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
              defaultValue={project.name}
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
              defaultValue={project.description}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-gap-4">
            <div className="flex flex-col gap-gap-2">
              <label htmlFor="type" className="font-medium text-heading">
                Type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={project.type}
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                {projectTypes.map((t) => (
                  <option key={t} value={t}>
                    {typeLabels[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-gap-2">
              <label htmlFor="status" className="font-medium text-heading">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={project.status}
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                {projectStatuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabels[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="border border-line p-pad-4">
            <legend className="font-medium text-heading px-pad-2">Links</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
              <div className="flex flex-col gap-gap-1">
                <label htmlFor="github" className="text-sm text-body">
                  GitHub
                </label>
                <input
                  type="url"
                  id="github"
                  name="github"
                  defaultValue={links.github || ""}
                  placeholder="https://github.com/..."
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-gap-1">
                <label htmlFor="website" className="text-sm text-body">
                  Website
                </label>
                <input
                  type="url"
                  id="website"
                  name="website"
                  defaultValue={links.website || ""}
                  placeholder="https://..."
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-gap-1">
                <label htmlFor="demo" className="text-sm text-body">
                  Live Demo
                </label>
                <input
                  type="url"
                  id="demo"
                  name="demo"
                  defaultValue={links.demo || ""}
                  placeholder="https://..."
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-gap-1">
                <label htmlFor="itchio" className="text-sm text-body">
                  itch.io
                </label>
                <input
                  type="url"
                  id="itchio"
                  name="itchio"
                  defaultValue={links.itchio || ""}
                  placeholder="https://....itch.io/..."
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-gap-1">
                <label htmlFor="npm" className="text-sm text-body">
                  npm
                </label>
                <input
                  type="url"
                  id="npm"
                  name="npm"
                  defaultValue={links.npm || ""}
                  placeholder="https://npmjs.com/package/..."
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-gap-1">
                <label htmlFor="pypi" className="text-sm text-body">
                  PyPI
                </label>
                <input
                  type="url"
                  id="pypi"
                  name="pypi"
                  defaultValue={links.pypi || ""}
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-gap-1">
                <label htmlFor="appstore" className="text-sm text-body">
                  App Store
                </label>
                <input
                  type="url"
                  id="appstore"
                  name="appstore"
                  defaultValue={links.appstore || ""}
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-gap-1">
                <label htmlFor="playstore" className="text-sm text-body">
                  Google Play
                </label>
                <input
                  type="url"
                  id="playstore"
                  name="playstore"
                  defaultValue={links.playstore || ""}
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-gap-1">
                <label htmlFor="steam" className="text-sm text-body">
                  Steam
                </label>
                <input
                  type="url"
                  id="steam"
                  name="steam"
                  defaultValue={links.steam || ""}
                  placeholder="https://store.steampowered.com/app/..."
                  className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-6">
            <ImageUpload
              label="Logo"
              name="logoData"
              existingName="existingLogo"
              aspect={1}
              existingImage={project.logo}
              previewStyle="square"
              helpText="Upload logo (1:1)"
            />
            <ImageUpload
              label="Cover Image"
              name="coverImageData"
              existingName="existingCoverImage"
              aspect={16 / 9}
              existingImage={project.coverImage}
              previewStyle="cover"
              helpText="Upload cover (16:9)"
            />
          </div>

          <TechnologySelect technologies={allTechnologies} selectedIds={selectedTechnologyIds} />

          <button
            type="submit"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors self-start"
          >
            Update Project
          </button>
        </Form>

        {/* Gallery Management */}
        <ProjectGalleryEditor images={project.images} />
      </div>
    </div>
  );
}
