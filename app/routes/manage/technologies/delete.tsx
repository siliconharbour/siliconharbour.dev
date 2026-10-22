import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import {
  getTechnologyById,
  getCompaniesUsingTechnology,
  getProjectsUsingTechnology,
} from "~/lib/technologies.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.technology?.name || "Technology"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "technology");

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
  await requireAdmin(request);

  const result = await runAdminOperation(request, operationCatalog.technologyDelete, {
    id: Number(params.id),
    confirm: true,
  });
  if (!result.ok) return { error: result.error };
  return redirect("/manage/technologies");
}

export default function DeleteTechnology() {
  const { technology, usageCount } = useLoaderData<typeof loader>();

  return (
    <DeleteConfirmationCard
      title="Delete Technology"
      message={
        <>
          Are you sure you want to delete <strong>{technology.name}</strong>? This action cannot be
          undone.
        </>
      }
    >
      <>
        {usageCount > 0 && (
          <div className="p-pad-3 bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            This technology is currently assigned to {usageCount}{" "}
            {usageCount === 1 ? "company/project" : "companies/projects"}. Deleting it will remove
            these assignments.
          </div>
        )}

        <Form method="post" className="flex gap-gap-4">
          <button
            type="submit"
            className="px-pad-4 py-pad-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
          >
            Delete
          </button>
          <Link
            to="/manage/technologies"
            className="px-pad-4 py-pad-2 text-body hover:bg-soft font-medium transition-colors"
          >
            Cancel
          </Link>
        </Form>
      </>
    </DeleteConfirmationCard>
  );
}
