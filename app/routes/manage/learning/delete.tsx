import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getLearningById, deleteLearning } from "~/lib/learning.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.institution?.name || "Institution"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid ID", { status: 400 });
  }

  const institution = await getLearningById(id);
  if (!institution) {
    throw new Response("Institution not found", { status: 404 });
  }

  return { institution };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid ID", { status: 400 });
  }

  await deleteLearning(id);
  return redirect("/manage/learning");
}

export default function DeleteLearning() {
  const { institution } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-harbour-200 p-6 flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-harbour-700">Delete Institution</h1>

        <p className="text-harbour-500">
          Are you sure you want to delete <strong>{institution.name}</strong>? This
          action cannot be undone.
        </p>

        <Form method="post" className="flex gap-4">
          <button
            type="submit"
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
          >
            Delete
          </button>
          <Link
            to="/manage/learning"
            className="px-4 py-2 text-harbour-600 hover:bg-harbour-50 font-medium transition-colors"
          >
            Cancel
          </Link>
        </Form>
      </div>
    </div>
  );
}
