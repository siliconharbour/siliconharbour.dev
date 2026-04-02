import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getEventById, updateEvent } from "~/lib/events.server";
import { processAndSaveCoverImage, processAndSaveIconImage } from "~/lib/images.server";
import { EventForm } from "~/components/EventForm";
import { parseIdOrError, parseIdOrThrow } from "~/lib/admin/route";
import { resolveUpdatedImage } from "~/lib/admin/image-fields";
import { actionError } from "~/lib/admin/action-result";
import {
  parseEventBaseForm,
  parseEventRecurringForm,
  parseOneTimeEventDates,
} from "~/lib/admin/manage-schemas";
import { db } from "~/db";
import { eq } from "drizzle-orm";
import { events as eventsTable } from "~/db/schema";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.event?.title || "Event"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "event");

  const event = await getEventById(id);
  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  return { event };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const parsedId = parseIdOrError(params.id, "event");
  if ("error" in parsedId) return parsedId;
  const id = parsedId.id;

  const existingEvent = await getEventById(id);
  if (!existingEvent) {
    return actionError("Event not found");
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string | null;
  const parsedBase = parseEventBaseForm(formData);
  if (!parsedBase.success) {
    return actionError(parsedBase.error);
  }

  // Check if this is a recurring event
  const isRecurring = parsedBase.data.eventType === "recurring";
  const coverImage = await resolveUpdatedImage({
    formData,
    uploadedImageField: "coverImageData",
    existingImageField: "existingCoverImage",
    currentImage: existingEvent.coverImage,
    processor: processAndSaveCoverImage,
  });
  const iconImage = await resolveUpdatedImage({
    formData,
    uploadedImageField: "iconImageData",
    existingImageField: "existingIconImage",
    currentImage: existingEvent.iconImage,
    processor: processAndSaveIconImage,
  });

  if (isRecurring) {
    const parsedRecurring = parseEventRecurringForm(formData);
    if (!parsedRecurring.success) {
      return actionError(parsedRecurring.error);
    }

    await updateEvent(
      id,
      {
        title: parsedBase.data.title,
        description: parsedBase.data.description,
        link: parsedBase.data.link,
        location: parsedBase.data.location,
        organizer: parsedBase.data.organizer,
        requiresSignup: parsedBase.data.requiresSignup,
        ...(coverImage !== undefined && { coverImage }),
        ...(iconImage !== undefined && { iconImage }),
        recurrenceStart: parsedRecurring.data.recurrenceStart
          ? new Date(parsedRecurring.data.recurrenceStart)
          : null,
        recurrenceRule: parsedRecurring.data.recurrenceRule,
        recurrenceEnd: parsedRecurring.data.recurrenceEnd
          ? new Date(parsedRecurring.data.recurrenceEnd)
          : null,
        defaultStartTime: parsedRecurring.data.defaultStartTime,
        defaultEndTime: parsedRecurring.data.defaultEndTime,
      },
      [], // Clear explicit dates for recurring events
    );
  } else {
    const parsedDates = parseOneTimeEventDates(formData);
    if (!parsedDates.success) {
      return actionError(parsedDates.error);
    }

    await updateEvent(
      id,
      {
        title: parsedBase.data.title,
        description: parsedBase.data.description,
        link: parsedBase.data.link,
        location: parsedBase.data.location,
        organizer: parsedBase.data.organizer,
        requiresSignup: parsedBase.data.requiresSignup,
        ...(coverImage !== undefined && { coverImage }),
        ...(iconImage !== undefined && { iconImage }),
        // Clear recurrence when switching to one-time
        recurrenceRule: null,
        recurrenceStart: null,
        recurrenceEnd: null,
        defaultStartTime: null,
        defaultEndTime: null,
      },
      parsedDates.data,
    );
  }

  // Publish imported event if requested
  if (intent === "save-and-publish") {
    await db
      .update(eventsTable)
      .set({ importStatus: "published", updatedAt: new Date() })
      .where(eq(eventsTable.id, id));

    if (existingEvent.importSourceId) {
      return redirect(`/manage/import/events/${existingEvent.importSourceId}`);
    }
  }

  return redirect("/manage/events");
}

export default function EditEvent() {
  const { event } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isRecurring = !!event.recurrenceRule;
  const isApprovedImport = event.importStatus === "approved";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to={event.importSourceId ? `/manage/import/events/${event.importSourceId}` : "/manage/events"}
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">Edit Event</h1>
          {isRecurring && (
            <Link
              to={`/manage/events/${event.id}/occurrences`}
              className="px-4 py-2 bg-harbour-100 text-harbour-700 hover:bg-harbour-200 text-sm"
            >
              Manage Occurrences
            </Link>
          )}
        </div>

        {isApprovedImport && (
          <div className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            This event was imported and is not yet public. Use <strong>Save &amp; Publish</strong> when ready to make it live.
          </div>
        )}

        <EventForm event={event} error={actionData?.error} showPublish={isApprovedImport} />
      </div>
    </div>
  );
}
