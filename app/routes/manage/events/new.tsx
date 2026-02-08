import type { Route } from "./+types/new";
import { Link, redirect, useActionData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { createEvent } from "~/lib/events.server";
import { processAndSaveCoverImage, processAndSaveIconImage } from "~/lib/images.server";
import { EventForm } from "~/components/EventForm";
import { actionError } from "~/lib/admin/action-result";
import { createImageFromFormData } from "~/lib/admin/image-fields";
import {
  parseEventBaseForm,
  parseEventRecurringForm,
  parseOneTimeEventDates,
} from "~/lib/admin/manage-schemas";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Event - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const parsedBase = parseEventBaseForm(formData);
  if (!parsedBase.success) {
    return actionError(parsedBase.error);
  }

  const coverImage = await createImageFromFormData(
    formData,
    "coverImageData",
    processAndSaveCoverImage,
  );
  const iconImage = await createImageFromFormData(formData, "iconImageData", processAndSaveIconImage);

  // Check if this is a recurring event
  const isRecurring = parsedBase.data.eventType === "recurring";

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
        recurrenceRule: parsedRecurring.data.recurrenceRule,
        recurrenceEnd: parsedRecurring.data.recurrenceEnd
          ? new Date(parsedRecurring.data.recurrenceEnd)
          : null,
        defaultStartTime: parsedRecurring.data.defaultStartTime,
        defaultEndTime: parsedRecurring.data.defaultEndTime,
      },
      [], // No explicit dates for recurring events
    );
  } else {
    const parsedDates = parseOneTimeEventDates(formData);
    if (!parsedDates.success) {
      return actionError(parsedDates.error);
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
      },
      parsedDates.data,
    );
  }

  return redirect("/manage/events");
}

export default function NewEvent() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/events" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Events
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Event</h1>

        <EventForm error={actionData?.error} />
      </div>
    </div>
  );
}
