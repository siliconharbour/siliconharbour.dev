import type { Route } from "./+types/events";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getDiscordConfig } from "~/lib/config.server";
import {
  getUnpostedEvents,
  createDiscordPost,
  skipItems,
  getPostHistory,
} from "~/lib/discord-posts.server";
import { buildEventsMessage } from "~/lib/discord-messages.server";
import { postMessage } from "~/lib/discord.server";
import { format } from "date-fns";
import { getGeneratedOccurrences } from "~/lib/events.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Discord Events - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [config, unpostedEvents, history] = await Promise.all([
    getDiscordConfig(),
    getUnpostedEvents(),
    getPostHistory("events"),
  ]);

  // For recurring events without explicit dates, generate synthetic dates
  const eventsWithDates = unpostedEvents.map((event) => {
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

  return {
    configured: Boolean(config.botToken && config.eventsChannelId),
    events: eventsWithDates,
    history,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const config = await getDiscordConfig();

  if (!config.botToken || !config.eventsChannelId) {
    return {
      error:
        "Discord is not configured. Please set bot token and events channel ID in Settings.",
    };
  }

  if (intent === "skip") {
    const eventId = Number(formData.get("eventId"));
    if (!eventId) return { error: "Invalid event ID" };

    await skipItems({
      channelType: "events",
      discordChannelId: config.eventsChannelId,
      itemIds: [eventId],
      itemType: "event",
    });
    return { success: true, skipped: true };
  }

  if (intent === "post") {
    const selectedIds = formData
      .getAll("selectedEvents")
      .map(Number)
      .filter(Boolean);
    if (selectedIds.length === 0) {
      return { error: "No events selected" };
    }

    const introText = (formData.get("introText") as string) || null;

    // Fetch the full event data for selected events
    const allUnposted = await getUnpostedEvents();
    const selectedEvents = allUnposted.filter((e) =>
      selectedIds.includes(e.id)
    );

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

    const components = buildEventsMessage(
      eventsForMessage,
      introText || undefined
    );
    const result = await postMessage(
      config.eventsChannelId,
      components,
      config.botToken
    );

    if (!result.success) {
      return { error: `Failed to post to Discord: ${result.error}` };
    }

    await createDiscordPost({
      channelType: "events",
      discordMessageId: result.messageId || null,
      discordChannelId: config.eventsChannelId,
      introText,
      itemIds: selectedIds,
      itemType: "event",
    });

    return { success: true, posted: selectedEvents.length };
  }

  return { error: "Unknown action" };
}

export default function DiscordEvents() {
  const { configured, events, history } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isPosting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "post";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-harbour-700">
              Discord Events
            </h1>
            <p className="text-harbour-400 text-sm">
              Compose and post event roundups to Discord
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/manage/discord/jobs"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              Jobs
            </Link>
            <Link
              to="/manage"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              Dashboard
            </Link>
          </div>
        </div>

        {!configured && (
          <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            Discord is not configured.{" "}
            <Link
              to="/manage/settings"
              className="underline hover:text-amber-900"
            >
              Go to Settings
            </Link>{" "}
            to set your bot token and events channel ID.
          </div>
        )}

        {actionData && "error" in actionData && actionData.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
            {actionData.error}
          </div>
        )}

        {actionData && "posted" in actionData && actionData.posted && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-700 text-sm">
            Posted {actionData.posted} event
            {actionData.posted !== 1 ? "s" : ""} to Discord.
          </div>
        )}

        {actionData && "skipped" in actionData && actionData.skipped && (
          <div className="p-4 bg-harbour-50 border border-harbour-200 text-harbour-600 text-sm">
            Event skipped.
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
                      ? format(
                          new Date(nextDate.startDate),
                          "EEE, MMM d 'at' h:mm a"
                        )
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
                          <span className="font-medium text-harbour-700">
                            {event.title}
                          </span>
                          <span className="text-sm text-harbour-400">
                            {dateLine}
                            {event.location
                              ? ` \u2022 ${event.location}`
                              : ""}
                          </span>
                        </div>
                        <Form method="post" className="flex-shrink-0">
                          <input type="hidden" name="intent" value="skip" />
                          <input
                            type="hidden"
                            name="eventId"
                            value={event.id}
                          />
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
            <h2 className="text-lg font-semibold text-harbour-700 mb-4">
              Recent Posts
            </h2>
            <div className="flex flex-col divide-y divide-harbour-100">
              {history.map((post) => (
                <div
                  key={post.id}
                  className="py-3 flex items-center justify-between text-sm"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-harbour-700">
                      {post.discordMessageId
                        ? `Posted ${post.itemCount} event${post.itemCount !== 1 ? "s" : ""}`
                        : `Skipped ${post.skippedCount} event${post.skippedCount !== 1 ? "s" : ""}`}
                    </span>
                    {post.introText && (
                      <span className="text-harbour-400 text-xs truncate max-w-sm">
                        {post.introText}
                      </span>
                    )}
                  </div>
                  <span className="text-harbour-400 text-xs">
                    {format(
                      new Date(post.postedAt),
                      "MMM d, yyyy 'at' h:mm a"
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
