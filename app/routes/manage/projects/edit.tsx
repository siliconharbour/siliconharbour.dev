import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { 
  getProjectWithImages, 
  updateProject, 
  addProjectImage,
  removeProjectImage,
} from "~/lib/projects.server";
import { parseProjectLinks, stringifyProjectLinks } from "~/lib/project-links";
import { processAndSaveCoverImage, processAndSaveIconImage, deleteImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { projectTypes, projectStatuses, type ProjectImage } from "~/db/schema";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.project?.name || "Project"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid project ID", { status: 400 });
  }

  const project = await getProjectWithImages(id);
  if (!project) {
    throw new Response("Project not found", { status: 404 });
  }

  return { project };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid project ID" };
  }

  const existingProject = await getProjectWithImages(id);
  if (!existingProject) {
    return { error: "Project not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Handle gallery image actions
  if (intent === "addGalleryImage") {
    const galleryImageData = formData.get("galleryImageData") as string | null;
    const caption = (formData.get("caption") as string) || null;
    
    if (galleryImageData) {
      const base64Data = galleryImageData.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");
      const imagePath = await processAndSaveCoverImage(buffer);
      await addProjectImage(id, imagePath, caption);
    }
    return { success: true };
  }

  if (intent === "removeGalleryImage") {
    const imageId = parseInt(formData.get("imageId") as string, 10);
    if (!isNaN(imageId)) {
      const image = existingProject.images.find(i => i.id === imageId);
      if (image) {
        await deleteImage(image.image);
        await removeProjectImage(imageId);
      }
    }
    return { success: true };
  }

  // Main form submission
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const type = formData.get("type") as string;
  const status = formData.get("status") as string;

  // Links
  const github = (formData.get("github") as string) || undefined;
  const itchio = (formData.get("itchio") as string) || undefined;
  const website = (formData.get("website") as string) || undefined;
  const demo = (formData.get("demo") as string) || undefined;
  const npm = (formData.get("npm") as string) || undefined;
  const steam = (formData.get("steam") as string) || undefined;

  if (!name || !description) {
    return { error: "Name and description are required" };
  }

  // Process images
  let logo: string | null | undefined = undefined;
  let coverImage: string | null | undefined = undefined;

  const logoData = formData.get("logoData") as string | null;
  const coverImageData = formData.get("coverImageData") as string | null;
  const existingLogo = formData.get("existingLogo") as string | null;
  const existingCoverImage = formData.get("existingCoverImage") as string | null;

  // Handle logo
  if (logoData) {
    if (existingProject.logo) {
      await deleteImage(existingProject.logo);
    }
    const base64Data = logoData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    logo = await processAndSaveIconImage(buffer);
  } else if (existingLogo) {
    logo = existingLogo;
  } else if (existingProject.logo) {
    await deleteImage(existingProject.logo);
    logo = null;
  }

  // Handle cover image
  if (coverImageData) {
    if (existingProject.coverImage) {
      await deleteImage(existingProject.coverImage);
    }
    const base64Data = coverImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    coverImage = await processAndSaveCoverImage(buffer);
  } else if (existingCoverImage) {
    coverImage = existingCoverImage;
  } else if (existingProject.coverImage) {
    await deleteImage(existingProject.coverImage);
    coverImage = null;
  }

  const links = stringifyProjectLinks({ github, itchio, website, demo, npm, steam });

  await updateProject(id, {
    name,
    description,
    type: type as typeof projectTypes[number],
    status: status as typeof projectStatuses[number],
    links: links || null,
    ...(logo !== undefined && { logo }),
    ...(coverImage !== undefined && { coverImage }),
  });

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
  const { project } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const links = parseProjectLinks(project.links);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage/projects"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Projects
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Project</h1>

        {actionData?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">
            {actionData.error}
          </div>
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
              defaultValue={project.name}
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
              defaultValue={project.description}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="type" className="font-medium text-harbour-700">
                Type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={project.type}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                {projectTypes.map((t) => (
                  <option key={t} value={t}>{typeLabels[t]}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="status" className="font-medium text-harbour-700">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={project.status}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                {projectStatuses.map((s) => (
                  <option key={s} value={s}>{statusLabels[s]}</option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="border border-harbour-200 p-4">
            <legend className="font-medium text-harbour-700 px-2">Links</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="github" className="text-sm text-harbour-600">GitHub</label>
                <input
                  type="url"
                  id="github"
                  name="github"
                  defaultValue={links.github || ""}
                  placeholder="https://github.com/..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="website" className="text-sm text-harbour-600">Website</label>
                <input
                  type="url"
                  id="website"
                  name="website"
                  defaultValue={links.website || ""}
                  placeholder="https://..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="demo" className="text-sm text-harbour-600">Live Demo</label>
                <input
                  type="url"
                  id="demo"
                  name="demo"
                  defaultValue={links.demo || ""}
                  placeholder="https://..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="itchio" className="text-sm text-harbour-600">itch.io</label>
                <input
                  type="url"
                  id="itchio"
                  name="itchio"
                  defaultValue={links.itchio || ""}
                  placeholder="https://....itch.io/..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="npm" className="text-sm text-harbour-600">npm</label>
                <input
                  type="url"
                  id="npm"
                  name="npm"
                  defaultValue={links.npm || ""}
                  placeholder="https://npmjs.com/package/..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="steam" className="text-sm text-harbour-600">Steam</label>
                <input
                  type="url"
                  id="steam"
                  name="steam"
                  defaultValue={links.steam || ""}
                  placeholder="https://store.steampowered.com/app/..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
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
    <div className="border-t border-harbour-200 pt-6">
      <h2 className="text-xl font-semibold text-harbour-700 mb-4">Gallery Images</h2>
      
      {/* Existing Images */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {images.map((image) => (
            <div key={image.id} className="relative group">
              <img
                src={`/images/${image.image}`}
                alt={image.caption || ""}
                className="w-full aspect-video object-cover"
              />
              {image.caption && (
                <p className="text-xs text-harbour-500 mt-1 truncate">{image.caption}</p>
              )}
              <fetcher.Form method="post" className="absolute top-2 right-2">
                <input type="hidden" name="intent" value="removeGalleryImage" />
                <input type="hidden" name="imageId" value={image.id} />
                <button
                  type="submit"
                  className="p-1.5 bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
    <fetcher.Form method="post" className="flex flex-col gap-4 p-4 border border-dashed border-harbour-300">
      <input type="hidden" name="intent" value="addGalleryImage" />
      
      <ImageUpload
        label="Add Gallery Image"
        name="galleryImageData"
        aspect={16 / 9}
        previewStyle="cover"
        helpText="Upload image (16:9)"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="caption" className="text-sm text-harbour-600">Caption (optional)</label>
        <input
          type="text"
          id="caption"
          name="caption"
          placeholder="Describe this image..."
          className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={fetcher.state !== "idle"}
        className="px-4 py-2 bg-harbour-100 hover:bg-harbour-200 text-harbour-700 font-medium transition-colors self-start disabled:opacity-50"
      >
        {fetcher.state !== "idle" ? "Adding..." : "Add to Gallery"}
      </button>
    </fetcher.Form>
  );
}
