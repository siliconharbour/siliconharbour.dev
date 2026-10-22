import { eventFormInput } from "~/lib/admin/event-form-adapter";
import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/new";
import { Link, redirect, useActionData, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { getPeriodOptions } from "~/lib/event-periods.server";

import { EventForm } from "~/components/EventForm";
import { actionError } from "~/lib/admin/action-result";

import { getEventTags } from "~/lib/event-tags.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Event - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [periodOptions, availableTags] = await Promise.all([getPeriodOptions(), getEventTags()]);
  return { periodOptions, availableTags };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const result = await runAdminOperation(
    request,
    operationCatalog.eventCreate,
    eventFormInput(await request.formData(), false),
  );
  if (!result.ok) return actionError(result.error);
  return redirect("/manage/events");
}

export default function NewEvent() {
  const actionData = useActionData<typeof action>();
  const { periodOptions, availableTags } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/events" className="text-sm text-subtle hover:text-body">
            &larr; Back to Events
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">New Event</h1>

        <EventForm
          error={actionData?.error}
          periodOptions={periodOptions}
          availableTags={availableTags}
        />
      </div>
    </div>
  );
}
