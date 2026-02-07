import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getProjectById, deleteProject, getProjectImages } from "~/lib/projects.server";
import { deleteImage } from "~/lib/images.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.project?.name || "Project"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "project");

  const project = await getProjectById(id);
  if (!project) {
    throw new Response("Project not found", { status: 404 });
  }

  return { project };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "project");

  const project = await getProjectById(id);
  if (project) {
    // Delete associated images
    if (project.logo) {
      await deleteImage(project.logo);
    }
    if (project.coverImage) {
      await deleteImage(project.coverImage);
    }

    // Delete gallery images
    const galleryImages = await getProjectImages(id);
    for (const img of galleryImages) {
      await deleteImage(img.image);
    }
  }

  await deleteProject(id);
  return redirect("/manage/projects");
}

export default function DeleteProject() {
  const { project } = useLoaderData<typeof loader>();

  return (
    <DeleteConfirmationCard
      title="Delete Project"
      message={
        <>
          Are you sure you want to delete <strong>{project.name}</strong>? This action cannot be
          undone and will also delete all gallery images.
        </>
      }
    >
      <Form method="post" className="flex gap-4">
        <button
          type="submit"
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
        >
          Delete
        </button>
        <Link
          to="/manage/projects"
          className="px-4 py-2 text-harbour-600 hover:bg-harbour-50 font-medium transition-colors"
        >
          Cancel
        </Link>
      </Form>
    </DeleteConfirmationCard>
  );
}
