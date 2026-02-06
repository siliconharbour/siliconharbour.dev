import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getTechnologyById,
  deleteTechnology,
  getCompaniesUsingTechnology,
  getProjectsUsingTechnology,
} from "~/lib/technologies.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.technology?.name || "Technology"} - siliconharbour.dev` }];
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

  return { technology, usageCount: companiesUsing.length + projectsUsing.length };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid technology ID", { status: 400 });
  }

  await deleteTechnology(id);
  return redirect("/manage/technologies");
}

export default function DeleteTechnology() {
  const { technology, usageCount } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-harbour-200 p-6 flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-harbour-700">Delete Technology</h1>

        <p className="text-harbour-500">
          Are you sure you want to delete <strong>{technology.name}</strong>? This action cannot be
          undone.
        </p>

        {usageCount > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            This technology is currently assigned to {usageCount}{" "}
            {usageCount === 1 ? "company/project" : "companies/projects"}. Deleting it will remove
            these assignments.
          </div>
        )}

        <Form method="post" className="flex gap-4">
          <button
            type="submit"
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
          >
            Delete
          </button>
          <Link
            to="/manage/technologies"
            className="px-4 py-2 text-harbour-600 hover:bg-harbour-50 font-medium transition-colors"
          >
            Cancel
          </Link>
        </Form>
      </div>
    </div>
  );
}
