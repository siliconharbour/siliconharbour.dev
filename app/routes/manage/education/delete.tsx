import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getEducationById, deleteEducation } from "~/lib/education.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.institution?.name || "Institution"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "education");

  const institution = await getEducationById(id);
  if (!institution) {
    throw new Response("Institution not found", { status: 404 });
  }

  return { institution };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "education");

  await deleteEducation(id);
  return redirect("/manage/education");
}

export default function DeleteEducation() {
  const { institution } = useLoaderData<typeof loader>();

  return (
    <DeleteConfirmationCard
      title="Delete Institution"
      message={
        <>
          Are you sure you want to delete <strong>{institution.name}</strong>? This action cannot
          be undone.
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
          to="/manage/education"
          className="px-4 py-2 text-harbour-600 hover:bg-harbour-50 font-medium transition-colors"
        >
          Cancel
        </Link>
      </Form>
    </DeleteConfirmationCard>
  );
}
