import {
  loadAdminOperation,
  loadAllAdminItems,
  runAdminOperation,
} from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";

import type { Route } from "./+types/events";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { format } from "date-fns";

import { parseRecurrenceRule, describeRecurrenceRule } from "~/lib/recurrence.server";
import { formatInTimezone } from "~/lib/timezone";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Discord Events - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [config, destinations, unpostedEvents, history] = await Promise.all([
    loadAdminOperation(request, operationCatalog.discordConfigGet, {}),
    loadAllAdminItems(request, operationCatalog.discordDestinationList, { type: "events" }),
    loadAllAdminItems(request, operationCatalog.discordUnpostedList, { type: "events" }),
    loadAllAdminItems(request, operationCatalog.discordPostHistory, { type: "events" }),
  ]);

  // For recurring events without explicit dates, generate synthetic dates
  // Also compute a human-readable recurrence label for display
  const eventsWithDates = unpostedEvents.map((event) => {
    if (!("dates" in event)) throw new Error("Expected an event in the Discord event queue");
    let recurrenceLabel: string | null = null;
    if (event.recurrenceRule) {
      const parsed = parseRecurrenceRule(event.recurrenceRule);
      if (parsed) recurrenceLabel = describeRecurrenceRule(parsed);
    }

    return { ...event, recurrenceLabel };
  });

  return {
    configured: Boolean(config.botTokenConfigured && destinations.length > 0),
    destinations,
    events: eventsWithDates,
    history,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "post") {
    const result = await runAdminOperation(request, operationCatalog.discordPost, {
      type: "events",
      itemIds: form.getAll("selectedEvents").map(Number),
      introText: form.get("introText") ?? null,
      confirm: true,
    });
    return result.ok ? result.data : ({ error: result.error } as const);
  }
  if (intent === "skip") {
    const result = await runAdminOperation(request, operationCatalog.discordSkip, {
      type: "events",
      itemIds: [Number(form.get("eventId"))],
    });
    return result.ok
      ? ({ success: true, skipped: true } as const)
      : ({ error: result.error } as const);
  }

  if (intent === "undo" || intent === "undo-batch") {
    const operation =
      intent === "undo" ? operationCatalog.discordUndo : operationCatalog.discordUndoBatch;
    const result = await runAdminOperation(request, operation, {
      ...(intent === "undo"
        ? { id: Number(form.get("postId")) }
        : { batchId: form.get("batchId") }),
      confirm: true,
    });
    return result.ok
      ? ({ success: true, undone: true } as const)
      : ({ error: result.error } as const);
  }
  return { error: "Unknown action" } as const;
}

export default function DiscordEvents() {
  const { configured, destinations, events, history } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isPosting =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "post";

  const hasFailures =
    actionData &&
    "failures" in actionData &&
    Array.isArray(actionData.failures) &&
    actionData.failures.length > 0;

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-gap-1">
            <h1 className="text-2xl font-semibold text-heading">Discord Events</h1>
            <p className="text-subtle text-sm">Compose and post event roundups to Discord</p>
          </div>
          <div className="flex items-center gap-gap-4">
            <Link to="/manage/discord/jobs" className="text-sm text-subtle hover:text-body">
              Jobs
            </Link>
            <Link to="/manage" className="text-sm text-subtle hover:text-body">
              Dashboard
            </Link>
          </div>
        </div>

        {!configured && (
          <div className="p-pad-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            Discord is not configured.{" "}
            <Link to="/manage/settings" className="underline hover:text-amber-900">
              Go to Settings
            </Link>{" "}
            to set your bot token and add at least one events destination.
          </div>
        )}

        {configured && destinations.length > 0 && (
          <div className="bg-surface border border-line p-pad-4 text-sm rounded-panel">
            <div className="flex items-center justify-between">
              <span className="font-medium text-heading">
                Posting to {destinations.length} channel{destinations.length !== 1 ? "s" : ""}:
              </span>
              <Link to="/manage/settings" className="text-xs text-subtle hover:text-body">
                Edit
              </Link>
            </div>
            <ul className="mt-2 flex flex-col gap-gap-1 text-subtle">
              {destinations.map((d) => (
                <li key={d.id}>
                  {d.guildName} <span className="text-heading">#{d.channelName}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {actionData && "error" in actionData && actionData.error && (
          <div className="p-pad-4 bg-red-50 border border-red-200 text-red-700 text-sm">
            {actionData.error}
          </div>
        )}

        {actionData && "posted" in actionData && actionData.posted && (
          <div className="p-pad-4 bg-green-50 border border-green-200 text-green-700 text-sm">
            Posted {actionData.posted} event{actionData.posted !== 1 ? "s" : ""} to{" "}
            {actionData.destinations} channel{actionData.destinations !== 1 ? "s" : ""}.
            {hasFailures && (
              <div className="mt-2 text-red-700">
                Failed to post to:{" "}
                {actionData.failures.map((f) => `#${f.channelName} (${f.error})`).join("; ")}
              </div>
            )}
          </div>
        )}

        {actionData && "skipped" in actionData && actionData.skipped && (
          <div className="p-pad-4 bg-soft border border-line text-body text-sm">Event skipped.</div>
        )}

        {actionData && "undone" in actionData && actionData.undone && (
          <div className="p-pad-4 bg-soft border border-line text-body text-sm">
            Post undone. Events have been requeued.
          </div>
        )}

        {configured && events.length === 0 && (
          <div className="p-pad-6 bg-surface border border-line text-subtle text-sm text-center rounded-panel">
            No unposted upcoming events. All caught up!
          </div>
        )}

        {configured && events.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="post" />

            <div className="flex flex-col gap-gap-4">
              <div className="bg-surface border border-line p-pad-6 rounded-panel">
                <h2 className="text-lg font-semibold text-heading mb-4">
                  Unposted Events ({events.length})
                </h2>

                <div className="flex flex-col gap-gap-2">
                  {events.map((event) => {
                    const nextDate = event.dates[0];
                    const dateLine = nextDate
                      ? nextDate.isAllDay
                        ? formatInTimezone(new Date(nextDate.startDate), "EEE, MMM d")
                        : formatInTimezone(new Date(nextDate.startDate), "EEE, MMM d 'at' h:mm a")
                      : "Recurring";
                    return (
                      <div
                        key={event.id}
                        className="flex items-start gap-gap-4 p-pad-4 border border-harbour-100"
                      >
                        <input
                          type="checkbox"
                          name="selectedEvents"
                          value={event.id}
                          defaultChecked
                          className="mt-1 h-4 w-4 text-body border border-harbour-300 focus:ring-harbour-500"
                        />
                        <div className="flex-1 flex flex-col gap-gap-1">
                          <span className="font-medium text-heading">{event.title}</span>
                          <span className="text-sm text-subtle">
                            {dateLine}
                            {event.recurrenceLabel ? ` (${event.recurrenceLabel})` : ""}
                            {event.location ? ` \u2022 ${event.location}` : ""}
                          </span>
                        </div>
                        <Form method="post" className="flex-shrink-0">
                          <input type="hidden" name="intent" value="skip" />
                          <input type="hidden" name="eventId" value={event.id} />
                          <button
                            type="submit"
                            className="text-xs px-pad-2 py-pad-1 border border-line text-subtle hover:text-body hover:border-harbour-400 transition-colors"
                          >
                            Skip
                          </button>
                        </Form>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-surface border border-line p-pad-6 rounded-panel">
                <h2 className="text-lg font-semibold text-heading mb-4">Intro Text (optional)</h2>
                <textarea
                  name="introText"
                  rows={3}
                  placeholder="e.g., Here's what's coming up this week!"
                  className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPosting}
                  className="px-pad-6 py-pad-2 bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isPosting ? "Posting..." : "Post to Discord"}
                </button>
              </div>
            </div>
          </Form>
        )}

        {history.length > 0 && (
          <div className="bg-surface border border-line p-pad-6 rounded-panel">
            <h2 className="text-lg font-semibold text-heading mb-4">Recent Posts</h2>
            <div className="flex flex-col divide-y divide-harbour-100">
              {history.map((batch) => {
                const key = batch.batchId ?? `single-${batch.destinations[0]?.id}`;
                const isSkip =
                  batch.destinations.every((d) => d.discordMessageId === null) && !batch.batchId;
                const channelCount = batch.destinations.length;
                return (
                  <div
                    key={key}
                    className="py-pad-3 flex items-start justify-between text-sm gap-gap-3"
                  >
                    <div className="flex flex-col gap-gap-1 min-w-0 flex-1">
                      <span className="text-heading">
                        {isSkip
                          ? `Skipped ${batch.skippedCount} event${batch.skippedCount !== 1 ? "s" : ""}`
                          : `Posted ${batch.itemCount} event${batch.itemCount !== 1 ? "s" : ""} to ${channelCount} channel${channelCount !== 1 ? "s" : ""}`}
                      </span>
                      {batch.introText && (
                        <span className="text-subtle text-xs truncate">{batch.introText}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-gap-3 flex-shrink-0">
                      <span className="text-subtle text-xs">
                        {format(new Date(batch.postedAt), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                      <Form method="post">
                        {batch.batchId ? (
                          <>
                            <input type="hidden" name="intent" value="undo-batch" />
                            <input type="hidden" name="batchId" value={batch.batchId} />
                          </>
                        ) : (
                          <>
                            <input type="hidden" name="intent" value="undo" />
                            <input
                              type="hidden"
                              name="postId"
                              value={batch.destinations[0]?.id ?? ""}
                            />
                          </>
                        )}
                        <button
                          type="submit"
                          className="text-xs px-pad-2 py-pad-1 border border-line text-subtle hover:text-red-600 hover:border-red-300 transition-colors"
                          onClick={(e) => {
                            if (!confirm("Undo this post? Events will be requeued for posting.")) {
                              e.preventDefault();
                            }
                          }}
                        >
                          Undo
                        </button>
                      </Form>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
