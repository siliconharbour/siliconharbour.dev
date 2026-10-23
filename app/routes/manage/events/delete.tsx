import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getEventById } from "~/lib/events.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.event?.title || "Event"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "event");

  const event = await getEventById(id);
  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  return { event };
}

export async function action({ request, params }: Route.ActionArgs) {
  const result = await runAdminOperation(request, operationCatalog.eventDelete, {
    id: Number(params.id),
    confirm: true,
  });
  if (!result.ok) return { error: result.error };
  return redirect("/manage/events");
}

export default function DeleteEvent() {
  const { event } = useLoaderData<typeof loader>();

  return (
    <DeleteConfirmationCard
      title="Delete Event"
      message={
        <>
          Are you sure you want to delete <strong>{event.title}</strong>? This action cannot be
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
          to="/manage/events"
          className="px-pad-4 py-pad-2 text-body hover:bg-soft font-medium transition-colors"
        >
          Cancel
        </Link>
      </Form>
    </DeleteConfirmationCard>
  );
}
