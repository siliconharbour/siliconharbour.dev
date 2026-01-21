import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getEventById, updateEvent } from "~/lib/events.server";
import { processAndSaveCoverImage, processAndSaveIconImage, deleteImage } from "~/lib/images.server";
import { EventForm } from "~/components/EventForm";
import { parseAsTimezone } from "~/lib/timezone";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.event?.title || "Event"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid event ID", { status: 400 });
  }

  const event = await getEventById(id);
  if (!event) {
    throw new Response("Event not found", { status: 404 });
  }

  return { event };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid event ID" };
  }

  const existingEvent = await getEventById(id);
  if (!existingEvent) {
    return { error: "Event not found" };
  }

  const formData = await request.formData();

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const link = formData.get("link") as string;
  const location = (formData.get("location") as string) || null;
  const organizer = (formData.get("organizer") as string) || null;
  const eventType = formData.get("eventType") as string;
  const requiresSignup = formData.get("requiresSignup") === "on";

  if (!title || !description || !link) {
    return { error: "Title, description, and link are required" };
  }

  // Check if this is a recurring event
  const isRecurring = eventType === "recurring";

  // Process images
  let coverImage: string | null | undefined = undefined;
  let iconImage: string | null | undefined = undefined;

  const coverImageData = formData.get("coverImageData") as string | null;
  const iconImageData = formData.get("iconImageData") as string | null;
  const existingCoverImage = formData.get("existingCoverImage") as string | null;
  const existingIconImage = formData.get("existingIconImage") as string | null;

  // Handle cover image
  if (coverImageData) {
    // New image uploaded - delete old one if exists
    if (existingEvent.coverImage) {
      await deleteImage(existingEvent.coverImage);
    }
    const base64Data = coverImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    coverImage = await processAndSaveCoverImage(buffer);
  } else if (existingCoverImage) {
    // Keep existing image
    coverImage = existingCoverImage;
  } else if (existingEvent.coverImage) {
    // Image was removed
    await deleteImage(existingEvent.coverImage);
    coverImage = null;
  }

  // Handle icon image
  if (iconImageData) {
    if (existingEvent.iconImage) {
      await deleteImage(existingEvent.iconImage);
    }
    const base64Data = iconImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    iconImage = await processAndSaveIconImage(buffer);
  } else if (existingIconImage) {
    iconImage = existingIconImage;
  } else if (existingEvent.iconImage) {
    await deleteImage(existingEvent.iconImage);
    iconImage = null;
  }

  if (isRecurring) {
    // Handle recurring event
    const recurrenceRule = formData.get("recurrenceRule") as string;
    const defaultStartTime = formData.get("defaultStartTime") as string;
    const defaultEndTime = (formData.get("defaultEndTime") as string) || null;
    const recurrenceEndStr = formData.get("recurrenceEnd") as string | null;
    const recurrenceEnd = recurrenceEndStr ? new Date(recurrenceEndStr) : null;

    if (!recurrenceRule) {
      return { error: "Recurrence pattern is required for recurring events" };
    }

    await updateEvent(
      id,
      {
        title,
        description,
        link,
        location,
        organizer,
        requiresSignup,
        ...(coverImage !== undefined && { coverImage }),
        ...(iconImage !== undefined && { iconImage }),
        recurrenceRule,
        recurrenceEnd,
        defaultStartTime,
        defaultEndTime,
      },
      [] // Clear explicit dates for recurring events
    );
  } else {
    // Handle one-time event with explicit dates
    const dates: { startDate: Date; endDate: Date | null }[] = [];
    let dateIndex = 0;

    while (formData.has(`dates[${dateIndex}][startDate]`)) {
      const startDateStr = formData.get(`dates[${dateIndex}][startDate]`) as string;
      const startTime = formData.get(`dates[${dateIndex}][startTime]`) as string;
      const hasEnd = formData.get(`dates[${dateIndex}][hasEnd]`) === "1";

      // Parse as Newfoundland timezone
      const startDate = parseAsTimezone(startDateStr, startTime);
      let endDate: Date | null = null;

      if (hasEnd) {
        const endDateStr = formData.get(`dates[${dateIndex}][endDate]`) as string;
        const endTime = formData.get(`dates[${dateIndex}][endTime]`) as string;
        if (endDateStr && endTime) {
          endDate = parseAsTimezone(endDateStr, endTime);
        }
      }

      dates.push({ startDate, endDate });
      dateIndex++;
    }

    if (dates.length === 0) {
      return { error: "At least one date is required for one-time events" };
    }

    await updateEvent(
      id,
      {
        title,
        description,
        link,
        location,
        organizer,
        requiresSignup,
        ...(coverImage !== undefined && { coverImage }),
        ...(iconImage !== undefined && { iconImage }),
        // Clear recurrence when switching to one-time
        recurrenceRule: null,
        recurrenceEnd: null,
        defaultStartTime: null,
        defaultEndTime: null,
      },
      dates
    );
  }

  return redirect("/manage/events");
}

export default function EditEvent() {
  const { event } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isRecurring = !!event.recurrenceRule;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage/events"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Events
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

        <EventForm event={event} error={actionData?.error} />
      </div>
    </div>
  );
}
