import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form, useFetcher } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getProjectWithImages } from "~/lib/projects.server";
import { parseProjectLinks } from "~/lib/project-links";

import { ImageUpload } from "~/components/ImageUpload";
import { TechnologySelect } from "~/components/TechnologySelect";
import { projectTypes, projectStatuses, type ProjectImage } from "~/db/schema";
import { getAllTechnologies, getTechnologiesForContent } from "~/lib/technologies.server";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.project?.name || "Project"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid project ID", { status: 400 });
  }

  const project = await getProjectWithImages(id);
  if (!project) {
    throw new Response("Project not found", { status: 404 });
  }

  const [allTechnologies, projectTechnologies] = await Promise.all([
    getAllTechnologies(),
    getTechnologiesForContent("project", id),
  ]);

  return {
    project,
    allTechnologies,
    selectedTechnologyIds: projectTechnologies.map((t) => t.technologyId),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get("intent") === "addGalleryImage") {
    const result = await runAdminOperation(request, operationCatalog.projectGalleryAdd, {
      id: Number(params.id),
      image: { kind: "dataUrl", dataUrl: form.get("galleryImageData") },
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
  const links = parseProjectLinks(project.links);

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
        <GalleryManager images={project.images} />
      </div>
    </div>
  );
}

function GalleryManager({ images }: { images: ProjectImage[] }) {
  const fetcher = useFetcher();

  return (
    <div className="border-t border-line pt-pad-6">
      <h2 className="text-xl font-semibold text-heading mb-4">Gallery Images</h2>

      {/* Existing Images */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-gap-4 mb-6">
          {images.map((image) => (
            <div key={image.id} className="relative group">
              <img
                src={`/images/${image.image}`}
                alt={image.caption || ""}
                className="w-full aspect-video object-cover"
              />
              {image.caption && <p className="text-xs text-muted mt-1 truncate">{image.caption}</p>}
              <fetcher.Form method="post" className="absolute top-2 right-2">
                <input type="hidden" name="intent" value="removeGalleryImage" />
                <input type="hidden" name="imageId" value={image.id} />
                <button
                  type="submit"
                  className="p-pad-1-5 bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </fetcher.Form>
            </div>
          ))}
        </div>
      )}

      {/* Add New Image */}
      <GalleryImageUploader />
    </div>
  );
}

function GalleryImageUploader() {
  const fetcher = useFetcher();

  return (
    <fetcher.Form
      method="post"
      className="flex flex-col gap-gap-4 p-pad-4 border border-dashed border-harbour-300"
    >
      <input type="hidden" name="intent" value="addGalleryImage" />

      <ImageUpload
        label="Add Gallery Image"
        name="galleryImageData"
        aspect={16 / 9}
        previewStyle="cover"
        helpText="Upload image (16:9)"
      />

      <div className="flex flex-col gap-gap-1">
        <label htmlFor="caption" className="text-sm text-body">
          Caption (optional)
        </label>
        <input
          type="text"
          id="caption"
          name="caption"
          placeholder="Describe this image..."
          className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={fetcher.state !== "idle"}
        className="px-pad-4 py-pad-2 bg-tint hover:bg-harbour-200 text-heading font-medium transition-colors self-start disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {fetcher.state !== "idle" ? "Adding..." : "Add to Gallery"}
      </button>
    </fetcher.Form>
  );
}
