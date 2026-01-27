import type { Route } from "./+types/new";
import { Link, redirect, useActionData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { createProject } from "~/lib/projects.server";
import { stringifyProjectLinks } from "~/lib/project-links";
import { processAndSaveCoverImage, processAndSaveIconImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { projectTypes, projectStatuses } from "~/db/schema";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Project - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();

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
  let logo: string | null = null;
  let coverImage: string | null = null;

  const logoData = formData.get("logoData") as string | null;
  const coverImageData = formData.get("coverImageData") as string | null;

  if (logoData) {
    const base64Data = logoData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    logo = await processAndSaveIconImage(buffer);
  }

  if (coverImageData) {
    const base64Data = coverImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    coverImage = await processAndSaveCoverImage(buffer);
  }

  const links = stringifyProjectLinks({ github, itchio, website, demo, npm, steam });

  await createProject({
    name,
    description,
    type: type as (typeof projectTypes)[number],
    status: status as (typeof projectStatuses)[number],
    links: links || null,
    logo,
    coverImage,
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

export default function NewProject() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/projects" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Projects
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Project</h1>

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
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
              placeholder="Describe your project. You can use [[References]] to link to people, companies, etc."
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
                defaultValue="other"
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                {projectTypes.map((t) => (
                  <option key={t} value={t}>
                    {typeLabels[t]}
                  </option>
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
                defaultValue="active"
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                {projectStatuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabels[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="border border-harbour-200 p-4">
            <legend className="font-medium text-harbour-700 px-2">Links</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="github" className="text-sm text-harbour-600">
                  GitHub
                </label>
                <input
                  type="url"
                  id="github"
                  name="github"
                  placeholder="https://github.com/..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="website" className="text-sm text-harbour-600">
                  Website
                </label>
                <input
                  type="url"
                  id="website"
                  name="website"
                  placeholder="https://..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="demo" className="text-sm text-harbour-600">
                  Live Demo
                </label>
                <input
                  type="url"
                  id="demo"
                  name="demo"
                  placeholder="https://..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="itchio" className="text-sm text-harbour-600">
                  itch.io
                </label>
                <input
                  type="url"
                  id="itchio"
                  name="itchio"
                  placeholder="https://....itch.io/..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="npm" className="text-sm text-harbour-600">
                  npm
                </label>
                <input
                  type="url"
                  id="npm"
                  name="npm"
                  placeholder="https://npmjs.com/package/..."
                  className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="steam" className="text-sm text-harbour-600">
                  Steam
                </label>
                <input
                  type="url"
                  id="steam"
                  name="steam"
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

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Create Project
          </button>
        </Form>
      </div>
    </div>
  );
}
