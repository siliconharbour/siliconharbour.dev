import type { Route } from "./+types/events";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getDiscordConfig } from "~/lib/config.server";
import { listDestinations } from "~/lib/discord-destinations.server";
import {
  getUnpostedEvents,
  createDiscordPost,
  skipItems,
  getPostHistory,
  undoDiscordPost,
  undoDiscordBatch,
} from "~/lib/discord-posts.server";
import { buildEventsMessage } from "~/lib/discord-messages.server";
import { postMessage } from "~/lib/discord.server";
import { format } from "date-fns";
import { getGeneratedOccurrences } from "~/lib/events.server";
import { parseRecurrenceRule, describeRecurrenceRule } from "~/lib/recurrence.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Discord Events - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [config, destinations, unpostedEvents, history] = await Promise.all([
    getDiscordConfig(),
    listDestinations("events"),
    getUnpostedEvents(),
    getPostHistory("events"),
  ]);

  // For recurring events without explicit dates, generate synthetic dates
  // Also compute a human-readable recurrence label for display
  const eventsWithDates = unpostedEvents.map((event) => {
    let recurrenceLabel: string | null = null;
    if (event.recurrenceRule) {
      const parsed = parseRecurrenceRule(event.recurrenceRule);
      if (parsed) recurrenceLabel = describeRecurrenceRule(parsed);
    }

    if (event.dates.length === 0 && event.recurrenceRule) {
      const occurrences = getGeneratedOccurrences(event);
      const syntheticDates = occurrences.slice(0, 1).map((date, i) => ({
        id: -(i + 1),
        eventId: event.id,
        startDate: date,
        endDate: null,
      }));
      return { ...event, dates: syntheticDates, recurrenceLabel };
    }
    return { ...event, recurrenceLabel };
  });

  return {
    configured: Boolean(config.botToken && destinations.length > 0),
    destinations,
    events: eventsWithDates,
    history,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const config = await getDiscordConfig();

  if (!config.botToken) {
    return { error: "Discord is not configured. Set the bot token in Settings." };
  }

  if (intent === "skip") {
    const eventId = Number(formData.get("eventId"));
    if (!eventId) return { error: "Invalid event ID" };

    await skipItems({
      channelType: "events",
      itemIds: [eventId],
      itemType: "event",
    });
    return { success: true, skipped: true };
  }

  if (intent === "post") {
    const destinations = await listDestinations("events");
    if (destinations.length === 0) {
      return {
        error: "No event destinations configured. Add one in Settings.",
      };
    }

    const selectedIds = formData.getAll("selectedEvents").map(Number).filter(Boolean);
    if (selectedIds.length === 0) {
      return { error: "No events selected" };
    }

    const introText = (formData.get("introText") as string) || null;

    // Fetch the full event data for selected events
    const allUnposted = await getUnpostedEvents();
    const selectedEvents = allUnposted.filter((e) => selectedIds.includes(e.id));

    if (selectedEvents.length === 0) {
      return { error: "Selected events are no longer available" };
    }

    // For recurring events, generate synthetic dates for the message
    const eventsForMessage = selectedEvents.map((event) => {
      if (event.dates.length === 0 && event.recurrenceRule) {
        const occurrences = getGeneratedOccurrences(event);
        const syntheticDates = occurrences.slice(0, 1).map((date, i) => ({
          id: -(i + 1),
          eventId: event.id,
          startDate: date,
          endDate: null,
        }));
        return { ...event, dates: syntheticDates };
      }
      return event;
    });

    const components = buildEventsMessage(eventsForMessage, introText || undefined);

    // Fan-out: post to each destination, record one discord_posts row per
    // destination, all sharing a batch_id.
    const batchId = crypto.randomUUID();
    const successes: Array<{ destination: typeof destinations[number]; messageId: string | null }> = [];
    const failures: Array<{ destination: typeof destinations[number]; error: string }> = [];

    for (const destination of destinations) {
      const result = await postMessage(destination.channelId, components, config.botToken);
      if (result.success) {
        successes.push({ destination, messageId: result.messageId ?? null });
      } else {
        failures.push({ destination, error: result.error ?? "Unknown error" });
      }
    }

    if (successes.length === 0) {
      return {
        error: `Failed to post to any destination: ${failures
          .map((f) => `#${f.destination.channelName} (${f.error})`)
          .join("; ")}`,
      };
    }

    // Attach items to the first successful row; siblings reference the same batch.
    for (let i = 0; i < successes.length; i++) {
      const { destination, messageId } = successes[i];
      await createDiscordPost({
        channelType: "events",
        discordMessageId: messageId,
        destination: { guildId: destination.guildId, channelId: destination.channelId },
        batchId,
        introText,
        itemIds: selectedIds,
        itemType: "event",
        attachItems: i === 0,
      });
    }

    return {
      success: true,
      posted: selectedEvents.length,
      destinations: successes.length,
      failures: failures.map((f) => ({
        channelName: f.destination.channelName,
        guildName: f.destination.guildName,
        error: f.error,
      })),
    };
  }

  if (intent === "undo") {
    const postId = Number(formData.get("postId"));
    if (!postId) return { error: "Invalid post ID" };

    await undoDiscordPost(postId);
    return { success: true, undone: true };
  }

  if (intent === "undo-batch") {
    const batchId = formData.get("batchId");
    if (typeof batchId !== "string" || !batchId) return { error: "Invalid batch ID" };

    await undoDiscordBatch(batchId);
    return { success: true, undone: true };
  }

  return { error: "Unknown action" };
}

export default function DiscordEvents() {
  const { configured, destinations, events, history } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isPosting =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "post";

  const hasFailures =
    actionData && "failures" in actionData && Array.isArray(actionData.failures) && actionData.failures.length > 0;

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-harbour-700">Discord Events</h1>
            <p className="text-harbour-400 text-sm">Compose and post event roundups to Discord</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/manage/discord/jobs"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              Jobs
            </Link>
            <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
              Dashboard
            </Link>
          </div>
        </div>

        {!configured && (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            Discord is not configured.{" "}
            <Link to="/manage/settings" className="underline hover:text-amber-900">
              Go to Settings
            </Link>{" "}
            to set your bot token and add at least one events destination.
          </div>
        )}

        {configured && destinations.length > 0 && (
          <div className="bg-white border border-harbour-200 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-harbour-700">
                Posting to {destinations.length} channel{destinations.length !== 1 ? "s" : ""}:
              </span>
              <Link to="/manage/settings" className="text-xs text-harbour-400 hover:text-harbour-600">
                Edit
              </Link>
            </div>
            <ul className="mt-2 flex flex-col gap-1 text-harbour-400">
              {destinations.map((d) => (
                <li key={d.id}>
                  {d.guildName} <span className="text-harbour-700">#{d.channelName}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {actionData && "error" in actionData && actionData.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
            {actionData.error}
          </div>
        )}

        {actionData && "posted" in actionData && actionData.posted && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-700 text-sm">
            Posted {actionData.posted} event{actionData.posted !== 1 ? "s" : ""} to{" "}
            {actionData.destinations} channel{actionData.destinations !== 1 ? "s" : ""}.
            {hasFailures && (
              <div className="mt-2 text-red-700">
                Failed to post to: {actionData.failures.map((f) => `#${f.channelName} (${f.error})`).join("; ")}
              </div>
            )}
          </div>
        )}

        {actionData && "skipped" in actionData && actionData.skipped && (
          <div className="p-4 bg-harbour-50 border border-harbour-200 text-harbour-600 text-sm">
            Event skipped.
          </div>
        )}

        {actionData && "undone" in actionData && actionData.undone && (
          <div className="p-4 bg-harbour-50 border border-harbour-200 text-harbour-600 text-sm">
            Post undone. Events have been requeued.
          </div>
        )}

        {configured && events.length === 0 && (
          <div className="p-6 bg-white border border-harbour-200 text-harbour-400 text-sm text-center">
            No unposted upcoming events. All caught up!
          </div>
        )}

        {configured && events.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="post" />

            <div className="flex flex-col gap-4">
              <div className="bg-white border border-harbour-200 p-6">
                <h2 className="text-lg font-semibold text-harbour-700 mb-4">
                  Unposted Events ({events.length})
                </h2>

                <div className="flex flex-col gap-2">
                  {events.map((event) => {
                    const nextDate = event.dates[0];
                    const dateLine = nextDate
                      ? nextDate.isAllDay
                        ? format(new Date(nextDate.startDate), "EEE, MMM d")
                        : format(new Date(nextDate.startDate), "EEE, MMM d 'at' h:mm a")
                      : "Recurring";
                    return (
                      <div
                        key={event.id}
                        className="flex items-start gap-4 p-4 border border-harbour-100"
                      >
                        <input
                          type="checkbox"
                          name="selectedEvents"
                          value={event.id}
                          defaultChecked
                          className="mt-1 h-4 w-4 text-harbour-600 border border-harbour-300 focus:ring-harbour-500"
                        />
                        <div className="flex-1 flex flex-col gap-1">
                          <span className="font-medium text-harbour-700">{event.title}</span>
                          <span className="text-sm text-harbour-400">
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
                            className="text-xs px-2 py-1 border border-harbour-200 text-harbour-400 hover:text-harbour-600 hover:border-harbour-400 transition-colors"
                          >
                            Skip
                          </button>
                        </Form>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-harbour-200 p-6">
                <h2 className="text-lg font-semibold text-harbour-700 mb-4">
                  Intro Text (optional)
                </h2>
                <textarea
                  name="introText"
                  rows={3}
                  placeholder="e.g., Here's what's coming up this week!"
                  className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPosting}
                  className="px-6 py-2 bg-harbour-600 text-white hover:bg-harbour-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isPosting ? "Posting..." : "Post to Discord"}
                </button>
              </div>
            </div>
          </Form>
        )}

        {history.length > 0 && (
          <div className="bg-white border border-harbour-200 p-6">
            <h2 className="text-lg font-semibold text-harbour-700 mb-4">Recent Posts</h2>
            <div className="flex flex-col divide-y divide-harbour-100">
              {history.map((batch) => {
                const key = batch.batchId ?? `single-${batch.destinations[0]?.id}`;
                const isSkip = batch.destinations.every((d) => d.discordMessageId === null) && !batch.batchId;
                const channelCount = batch.destinations.length;
                return (
                  <div key={key} className="py-3 flex items-start justify-between text-sm gap-3">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span className="text-harbour-700">
                        {isSkip
                          ? `Skipped ${batch.skippedCount} event${batch.skippedCount !== 1 ? "s" : ""}`
                          : `Posted ${batch.itemCount} event${batch.itemCount !== 1 ? "s" : ""} to ${channelCount} channel${channelCount !== 1 ? "s" : ""}`}
                      </span>
                      {batch.introText && (
                        <span className="text-harbour-400 text-xs truncate">
                          {batch.introText}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-harbour-400 text-xs">
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
                            <input type="hidden" name="postId" value={batch.destinations[0]?.id ?? ""} />
                          </>
                        )}
                        <button
                          type="submit"
                          className="text-xs px-2 py-1 border border-harbour-200 text-harbour-400 hover:text-red-600 hover:border-red-300 transition-colors"
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
