import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getPersonById, deletePerson } from "~/lib/people.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.person?.name || "Person"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "person");

  const person = await getPersonById(id);
  if (!person) {
    throw new Response("Person not found", { status: 404 });
  }

  return { person };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "person");

  await deletePerson(id);
  return redirect("/manage/people");
}

export default function DeletePerson() {
  const { person } = useLoaderData<typeof loader>();

  return (
    <DeleteConfirmationCard
      title="Delete Person"
      message={
        <>
          Are you sure you want to delete <strong>{person.name}</strong>? This action cannot be
          undone.
        </>
      }
    >
      <Form method="post" className="flex gap-gap-4">
        <button
          type="submit"
          className="px-pad-4 py-pad-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
        >
          Delete
        </button>
        <Link
          to="/manage/people"
          className="px-pad-4 py-pad-2 text-body hover:bg-soft font-medium transition-colors"
        >
          Cancel
        </Link>
      </Form>
    </DeleteConfirmationCard>
  );
}
