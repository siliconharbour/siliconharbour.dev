import {
  loadAdminOperation,
  loadAllAdminItems,
  runAdminOperation,
} from "~/lib/admin/run-operation.server";
import { eventFormInput } from "~/lib/admin/event-form-adapter";
import { operationCatalog } from "~/operations/catalog";

import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { EventForm } from "~/components/EventForm";
import { parseIdOrThrow } from "~/lib/admin/route";

import { actionError } from "~/lib/admin/action-result";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.event?.title || "Event"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "event");

  const event = await loadAdminOperation(request, operationCatalog.eventGet, { id });

  const [periodOptions, availableTags] = await Promise.all([
    loadAllAdminItems(request, operationCatalog.eventPeriodOptionsList, { excludeId: event.id }),
    loadAllAdminItems(request, operationCatalog.eventTagList, { sort: "name", order: "asc" }),
  ]);
  return { event, periodOptions, availableTags };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const id = parseIdOrThrow(params.id, "event");
  const form = await request.formData();
  const result = await runAdminOperation(request, operationCatalog.eventUpdate, {
    id,
    ...eventFormInput(form, true),
  });
  if (!result.ok) return actionError(result.error);
  if (form.get("intent") === "save-and-publish" && result.data.importSourceId)
    return redirect(`/manage/import/events/${result.data.importSourceId}`);
  return redirect("/manage/events");
}

export default function EditEvent() {
  const { event, periodOptions, availableTags } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isRecurring = !!event.recurrenceRule;
  // Visibility rule: importStatus IS NULL OR = 'published'. Anything else
  // is hidden from public listings (pending_review, approved, hidden,
  // removed). Show the publish button for any of those. Show the unpublish
  // counterpart when published.
  const isPublished = event.importStatus === "published";
  const isHiddenFromPublic = event.importStatus !== null && event.importStatus !== "published";

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link
            to={
              event.importSourceId
                ? `/manage/import/events/${event.importSourceId}`
                : "/manage/events"
            }
            className="text-sm text-subtle hover:text-body"
          >
            &larr; Back
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-heading">Edit Event</h1>
          {isRecurring && (
            <Link
              to={`/manage/events/${event.id}/occurrences`}
              className="px-pad-4 py-pad-2 bg-tint text-heading hover:bg-harbour-200 text-sm"
            >
              Manage Occurrences
            </Link>
          )}
        </div>

        {isHiddenFromPublic && (
          <div className="border border-amber-200 bg-amber-50 p-pad-4 text-sm text-amber-800">
            This event is <strong>not public</strong> (status: <code>{event.importStatus}</code>).
            Use <strong>Save &amp; Publish</strong> when ready to make it live.
          </div>
        )}

        <EventForm
          event={event}
          periodOptions={periodOptions}
          availableTags={availableTags}
          error={actionData?.error}
          showPublish={isHiddenFromPublic}
          showUnpublish={isPublished}
        />
      </div>
    </div>
  );
}
