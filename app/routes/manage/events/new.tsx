import type { Route } from "./+types/new";
import { Link, redirect, useActionData, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { createEvent } from "~/lib/events.server";
import { getPeriodOptions } from "~/lib/event-periods.server";
import { processAndSaveCoverImage, processAndSaveIconImage } from "~/lib/images.server";
import { EventForm } from "~/components/EventForm";
import { actionError } from "~/lib/admin/action-result";
import { createImageFromFormData, resolveGeneratedCoverImage } from "~/lib/admin/image-fields";
import {
  parseEventBaseForm,
  parseEventRecurringForm,
  parseOneTimeEventDates,
} from "~/lib/admin/manage-schemas";
import { validatePeriodDates } from "~/lib/event-timing";
import { getEventTags } from "~/lib/event-tags.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Event - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [periodOptions, availableTags] = await Promise.all([getPeriodOptions(), getEventTags()]);
  return { periodOptions, availableTags };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const tagIds = formData.getAll("tagIds").map(Number).filter(Number.isInteger);
  const parsedBase = parseEventBaseForm(formData);
  if (!parsedBase.success) {
    return actionError(parsedBase.error);
  }

  const iconImage = await createImageFromFormData(
    formData,
    "iconImageData",
    processAndSaveIconImage,
  );
  // If "Generate cover from icon" was requested, synthesize it from the
  // icon palette; otherwise honor the regular upload field.
  const generatedCover = await resolveGeneratedCoverImage(formData, null, null);
  const coverImage =
    generatedCover ??
    (await createImageFromFormData(formData, "coverImageData", processAndSaveCoverImage));

  // Check if this is a recurring event
  const isRecurring = parsedBase.data.eventType === "recurring";
  const timeMode = parsedBase.data.eventType === "period" ? "period" : "scheduled";

  try {
    if (isRecurring) {
      const parsedRecurring = parseEventRecurringForm(formData);
      if (!parsedRecurring.success) {
        return actionError(parsedRecurring.error);
      }

      await createEvent(
        {
          title: parsedBase.data.title,
          description: parsedBase.data.description,
          link: parsedBase.data.link,
          location: parsedBase.data.location,
          organizer: parsedBase.data.organizer,
          coverImage,
          iconImage,
          requiresSignup: parsedBase.data.requiresSignup,
          timeMode,
          parentEventId: parsedBase.data.parentEventId,
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
        [], // No explicit dates for recurring events
        tagIds,
      );
    } else {
      const parsedDates = parseOneTimeEventDates(formData);
      if (!parsedDates.success) {
        return actionError(parsedDates.error);
      }
      const periodError = validatePeriodDates(timeMode, parsedDates.data);
      if (periodError) return actionError(periodError);

      await createEvent(
        {
          title: parsedBase.data.title,
          description: parsedBase.data.description,
          link: parsedBase.data.link,
          location: parsedBase.data.location,
          organizer: parsedBase.data.organizer,
          coverImage,
          iconImage,
          requiresSignup: parsedBase.data.requiresSignup,
          timeMode,
          parentEventId: parsedBase.data.parentEventId,
        },
        parsedDates.data,
        tagIds,
      );
    }
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Could not save the event.");
  }

  return redirect("/manage/events");
}

export default function NewEvent() {
  const actionData = useActionData<typeof action>();
  const { periodOptions, availableTags } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/events" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Events
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Event</h1>

        <EventForm
          error={actionData?.error}
          periodOptions={periodOptions}
          availableTags={availableTags}
        />
      </div>
    </div>
  );
}
