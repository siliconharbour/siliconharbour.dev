import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getGroupById } from "~/lib/groups.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.group?.name || "Group"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "group");

  const group = await getGroupById(id);
  if (!group) {
    throw new Response("Group not found", { status: 404 });
  }

  return { group };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);

  const result = await runAdminOperation(request, operationCatalog.groupDelete, {
    id: Number(params.id),
    confirm: true,
  });
  if (!result.ok) return { error: result.error };
  return redirect("/manage/groups");
}

export default function DeleteGroup() {
  const { group } = useLoaderData<typeof loader>();

  return (
    <DeleteConfirmationCard
      title="Delete Group"
      message={
        <>
          Are you sure you want to delete <strong>{group.name}</strong>? This action cannot be
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
          to="/manage/groups"
          className="px-pad-4 py-pad-2 text-body hover:bg-soft font-medium transition-colors"
        >
          Cancel
        </Link>
      </Form>
    </DeleteConfirmationCard>
  );
}
