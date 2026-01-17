import type { Route } from "./+types/occurrences";
import { Link, Form, useLoaderData, useActionData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { 
  getEventById, 
  getEventWithOccurrences, 
  upsertOccurrenceOverride,
  deleteOccurrenceOverride,
} from "~/lib/events.server";
import { describeRecurrenceRule, parseRecurrenceRule } from "~/lib/recurrence.server";
import { format } from "date-fns";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Manage Occurrences - ${data?.event?.title || "Event"} - siliconharbour.dev` }];
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

  if (!event.recurrenceRule) {
    throw new Response("This event is not recurring", { status: 400 });
  }

  const eventWithOccurrences = await getEventWithOccurrences(id);
  const occurrences = eventWithOccurrences?.occurrences || [];

  const parsed = parseRecurrenceRule(event.recurrenceRule);
  const recurrenceDescription = parsed ? describeRecurrenceRule(parsed) : null;

  return { event, occurrences, recurrenceDescription };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid event ID" };
  }

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  if (actionType === "cancel") {
    const dateStr = formData.get("date") as string;
    const date = new Date(dateStr);
    await upsertOccurrenceOverride(id, date, { cancelled: true });
    return { success: "Occurrence cancelled" };
  }

  if (actionType === "uncancel") {
    const dateStr = formData.get("date") as string;
    const date = new Date(dateStr);
    await upsertOccurrenceOverride(id, date, { cancelled: false });
    return { success: "Occurrence restored" };
  }

  if (actionType === "update") {
    const dateStr = formData.get("date") as string;
    const date = new Date(dateStr);
    const location = (formData.get("location") as string) || null;
    const startTime = (formData.get("startTime") as string) || null;
    const endTime = (formData.get("endTime") as string) || null;

    await upsertOccurrenceOverride(id, date, {
      location,
      startTime,
      endTime,
    });
    return { success: "Occurrence updated" };
  }

  if (actionType === "clearOverride") {
    const overrideId = parseInt(formData.get("overrideId") as string, 10);
    if (!isNaN(overrideId)) {
      await deleteOccurrenceOverride(overrideId);
      return { success: "Override cleared" };
    }
  }

  return { error: "Unknown action" };
}

export default function ManageOccurrences() {
  const { event, occurrences, recurrenceDescription } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to={`/manage/events/${event.id}`}
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Edit Event
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-harbour-700">
            Manage Occurrences
          </h1>
          <p className="text-harbour-500 mt-1">{event.title}</p>
          {recurrenceDescription && (
            <p className="text-sm text-harbour-400 mt-1">
              {recurrenceDescription}
              {event.defaultStartTime && ` at ${event.defaultStartTime}`}
              {event.defaultEndTime && ` - ${event.defaultEndTime}`}
            </p>
          )}
        </div>

        {actionData?.error && (
          <div className="p-3 bg-red-100 text-red-700 text-sm">
            {actionData.error}
          </div>
        )}

        {actionData?.success && (
          <div className="p-3 bg-green-100 text-green-700 text-sm">
            {actionData.success}
          </div>
        )}

        <div className="space-y-4">
          <p className="text-sm text-harbour-500">
            The following dates are generated from the recurrence pattern. 
            You can cancel individual occurrences or override their location/time.
          </p>

          <div className="divide-y divide-harbour-200">
            {occurrences.map((occurrence, i) => (
              <div
                key={i}
                className={`py-4 ${occurrence.cancelled ? "opacity-60" : ""}`}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <div className={`font-medium ${occurrence.cancelled ? "line-through text-harbour-400" : "text-harbour-700"}`}>
                      {format(occurrence.date, "EEEE, MMMM d, yyyy")}
                    </div>
                    <div className="text-sm text-harbour-500">
                      {format(occurrence.date, "h:mm a")}
                      {occurrence.endDate && ` - ${format(occurrence.endDate, "h:mm a")}`}
                    </div>
                    {occurrence.location && (
                      <div className="text-sm text-harbour-400">
                        {occurrence.location}
                        {occurrence.location !== event.location && (
                          <span className="ml-1 text-amber-600">(overridden)</span>
                        )}
                      </div>
                    )}
                    {occurrence.cancelled && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs">
                        Cancelled
                      </span>
                    )}
                    {occurrence.overrideId && !occurrence.cancelled && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs">
                        Has overrides
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {occurrence.cancelled ? (
                      <Form method="post">
                        <input type="hidden" name="_action" value="uncancel" />
                        <input type="hidden" name="date" value={occurrence.date.toISOString()} />
                        <button
                          type="submit"
                          className="px-3 py-1 text-sm bg-green-600 text-white hover:bg-green-700"
                        >
                          Restore
                        </button>
                      </Form>
                    ) : (
                      <>
                        <Form method="post">
                          <input type="hidden" name="_action" value="cancel" />
                          <input type="hidden" name="date" value={occurrence.date.toISOString()} />
                          <button
                            type="submit"
                            className="px-3 py-1 text-sm bg-red-600 text-white hover:bg-red-700"
                          >
                            Cancel
                          </button>
                        </Form>
                        <details className="relative">
                          <summary className="px-3 py-1 text-sm bg-harbour-100 text-harbour-700 hover:bg-harbour-200 cursor-pointer list-none">
                            Edit
                          </summary>
                          <div className="absolute right-0 mt-2 p-4 bg-white border border-harbour-200 shadow-lg z-10 min-w-72">
                            <Form method="post" className="space-y-3">
                              <input type="hidden" name="_action" value="update" />
                              <input type="hidden" name="date" value={occurrence.date.toISOString()} />
                              
                              <div>
                                <label className="block text-xs text-harbour-500 mb-1">
                                  Location Override
                                </label>
                                <input
                                  type="text"
                                  name="location"
                                  defaultValue={occurrence.location || ""}
                                  placeholder={event.location || "Enter location"}
                                  className="w-full px-2 py-1 text-sm border border-harbour-200"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs text-harbour-500 mb-1">
                                    Start Time
                                  </label>
                                  <input
                                    type="time"
                                    name="startTime"
                                    defaultValue={format(occurrence.date, "HH:mm")}
                                    className="w-full px-2 py-1 text-sm border border-harbour-200"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-harbour-500 mb-1">
                                    End Time
                                  </label>
                                  <input
                                    type="time"
                                    name="endTime"
                                    defaultValue={occurrence.endDate ? format(occurrence.endDate, "HH:mm") : ""}
                                    className="w-full px-2 py-1 text-sm border border-harbour-200"
                                  />
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  className="px-3 py-1 text-sm bg-harbour-600 text-white hover:bg-harbour-700"
                                >
                                  Save
                                </button>
                              </div>
                            </Form>

                            {occurrence.overrideId && (
                              <Form method="post" className="mt-2 pt-2 border-t border-harbour-200">
                                <input type="hidden" name="_action" value="clearOverride" />
                                <input type="hidden" name="overrideId" value={occurrence.overrideId} />
                                <button
                                  type="submit"
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  Clear all overrides
                                </button>
                              </Form>
                            )}
                          </div>
                        </details>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {occurrences.length === 0 && (
            <p className="text-harbour-400 py-8 text-center">
              No upcoming occurrences found.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
