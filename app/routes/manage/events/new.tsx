import type { Route } from "./+types/new";
import { Link, redirect, useActionData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { createEvent } from "~/lib/events.server";
import { processAndSaveCoverImage, processAndSaveIconImage } from "~/lib/images.server";
import { EventForm } from "~/components/EventForm";

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

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const link = formData.get("link") as string;
  const location = (formData.get("location") as string) || null;
  const organizer = (formData.get("organizer") as string) || null;
  const eventType = formData.get("eventType") as string;

  if (!title || !description || !link) {
    return { error: "Title, description, and link are required" };
  }

  // Process images
  let coverImage: string | null = null;
  let iconImage: string | null = null;

  const coverImageData = formData.get("coverImageData") as string | null;
  const iconImageData = formData.get("iconImageData") as string | null;

  if (coverImageData) {
    const base64Data = coverImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    coverImage = await processAndSaveCoverImage(buffer);
  }

  if (iconImageData) {
    const base64Data = iconImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    iconImage = await processAndSaveIconImage(buffer);
  }

  // Check if this is a recurring event
  const isRecurring = eventType === "recurring";

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

    await createEvent(
      {
        title,
        description,
        link,
        location,
        organizer,
        coverImage,
        iconImage,
        recurrenceRule,
        recurrenceEnd,
        defaultStartTime,
        defaultEndTime,
      },
      [] // No explicit dates for recurring events
    );
  } else {
    // Handle one-time event with explicit dates
    const dates: { startDate: Date; endDate: Date | null }[] = [];
    let dateIndex = 0;

    while (formData.has(`dates[${dateIndex}][startDate]`)) {
      const startDateStr = formData.get(`dates[${dateIndex}][startDate]`) as string;
      const startTime = formData.get(`dates[${dateIndex}][startTime]`) as string;
      const hasEnd = formData.get(`dates[${dateIndex}][hasEnd]`) === "1";

      const startDate = new Date(`${startDateStr}T${startTime}`);
      let endDate: Date | null = null;

      if (hasEnd) {
        const endDateStr = formData.get(`dates[${dateIndex}][endDate]`) as string;
        const endTime = formData.get(`dates[${dateIndex}][endTime]`) as string;
        if (endDateStr && endTime) {
          endDate = new Date(`${endDateStr}T${endTime}`);
        }
      }

      dates.push({ startDate, endDate });
      dateIndex++;
    }

    if (dates.length === 0) {
      return { error: "At least one date is required for one-time events" };
    }

    await createEvent(
      {
        title,
        description,
        link,
        location,
        organizer,
        coverImage,
        iconImage,
      },
      dates
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
          <Link
            to="/manage/events"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Events
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Event</h1>

        <EventForm error={actionData?.error} />
      </div>
    </div>
  );
}
