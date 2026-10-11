import type { Route } from "./+types/jobs";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getDiscordConfig } from "~/lib/config.server";
import { listDestinations } from "~/lib/discord-destinations.server";
import {
  getUnpostedJobs,
  createDiscordPost,
  skipItems,
  getPostHistory,
  undoDiscordPost,
  undoDiscordBatch,
} from "~/lib/discord-posts.server";
import { buildJobsMessage } from "~/lib/discord-messages.server";
import { logDiscord, postMessage } from "~/lib/discord.server";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Discord Jobs - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [config, destinations, unpostedJobs, history] = await Promise.all([
    getDiscordConfig(),
    listDestinations("jobs"),
    getUnpostedJobs(),
    getPostHistory("jobs"),
  ]);

  return {
    configured: Boolean(config.botToken && destinations.length > 0),
    destinations,
    jobs: unpostedJobs,
    history,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const config = await getDiscordConfig();

  if (!config.botToken) {
    return { error: "Discord is not configured. Set the bot token in Settings." };
  }

  if (intent === "skip-old") {
    const allUnposted = await getUnpostedJobs();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oldJobs = allUnposted.filter((j) => {
      const jobDate = j.postedAt || j.firstSeenAt || j.createdAt;
      return jobDate < oneWeekAgo;
    });

    if (oldJobs.length === 0) {
      return { error: "No jobs older than a week to skip" };
    }

    await skipItems({
      channelType: "jobs",
      itemIds: oldJobs.map((j) => j.id),
      itemType: "job",
    });
    return { success: true, skippedOld: oldJobs.length };
  }

  if (intent === "skip") {
    const jobId = Number(formData.get("jobId"));
    if (!jobId) return { error: "Invalid job ID" };

    await skipItems({
      channelType: "jobs",
      itemIds: [jobId],
      itemType: "job",
    });
    return { success: true, skipped: true };
  }

  if (intent === "post") {
    const destinations = await listDestinations("jobs");
    if (destinations.length === 0) {
      return {
        error: "No job destinations configured. Add one in Settings.",
      };
    }

    const selectedIds = formData.getAll("selectedJobs").map(Number).filter(Boolean);
    if (selectedIds.length === 0) {
      return { error: "No jobs selected" };
    }

    const introText = (formData.get("introText") as string) || null;

    const allUnposted = await getUnpostedJobs();
    const selectedJobs = allUnposted.filter((j) => selectedIds.includes(j.id));

    if (selectedJobs.length === 0) {
      return { error: "Selected jobs are no longer available" };
    }

    const jobsForMessage = selectedJobs.map((j) => ({
      slug: j.slug,
      title: j.title,
      location: j.location,
      workplaceType: j.workplaceType,
      companyName: j.companyName,
      isTechnical: j.isTechnical,
      url: j.url,
    }));

    const messages = buildJobsMessage(jobsForMessage, introText || undefined);

    // Fan-out per destination. For each destination, send all chunks; on any
    // chunk failure, mark the destination as failed and continue to the next.
    const batchId = crypto.randomUUID();
    const successes: Array<{
      destination: typeof destinations[number];
      firstMessageId: string | null;
    }> = [];
    const failures: Array<{ destination: typeof destinations[number]; error: string }> = [];

    logDiscord("batch.started", {
      batchId,
      channelType: "jobs",
      itemIds: selectedJobs.map((job) => job.id),
      destinationCount: destinations.length,
      chunkCount: messages.length,
    });

    for (const destination of destinations) {
      const messageIds: string[] = [];
      let chunkError: string | null = null;
      for (let chunkIndex = 0; chunkIndex < messages.length; chunkIndex++) {
        const components = messages[chunkIndex];
        const result = await postMessage(destination.channelId, components, config.botToken, {
          batchId,
          channelType: "jobs",
          destinationId: destination.id,
          chunkIndex: chunkIndex + 1,
          chunkCount: messages.length,
        });
        if (!result.success) {
          chunkError = `${result.error}${messageIds.length > 0 ? ` (${messageIds.length} message(s) already sent)` : ""}`;
          break;
        }
        if (result.messageId) messageIds.push(result.messageId);
      }

      if (chunkError) {
        failures.push({ destination, error: chunkError });
      } else {
        successes.push({ destination, firstMessageId: messageIds[0] ?? null });
      }
    }

    if (successes.length === 0) {
      return {
        error: `Failed to post to any destination: ${failures
          .map((f) => `#${f.destination.channelName} (${f.error})`)
          .join("; ")}`,
      };
    }

    // Attach items to the first successful row only; siblings share batch_id.
    for (let i = 0; i < successes.length; i++) {
      const { destination, firstMessageId } = successes[i];
      await createDiscordPost({
        channelType: "jobs",
        discordMessageId: firstMessageId,
        destination: { guildId: destination.guildId, channelId: destination.channelId },
        batchId,
        introText,
        itemIds: selectedIds,
        itemType: "job",
        attachItems: i === 0,
      });
    }

    logDiscord("batch.recorded", {
      batchId,
      channelType: "jobs",
      destinationSuccessCount: successes.length,
      destinationFailureCount: failures.length,
    });

    return {
      success: true,
      posted: selectedJobs.length,
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

function JobRow({
  job,
}: {
  job: {
    id: number;
    title: string;
    companyName: string | null;
    location: string | null;
    workplaceType: string | null;
    isTechnical: boolean;
    postedAt: Date | null;
  };
}) {
  return (
    <div className="flex items-start gap-gap-4 p-pad-4 border border-harbour-100">
      <input
        type="checkbox"
        name="selectedJobs"
        value={job.id}
        defaultChecked
        className="mt-1 h-4 w-4 text-body border border-harbour-300 focus:ring-harbour-500"
      />
      <div className="flex-1 flex flex-col gap-gap-1">
        <span className="font-medium text-heading">
          {job.title}
          {!job.isTechnical && (
            <span className="ml-2 text-xs px-pad-1-5 py-pad-0-5 bg-soft text-subtle">
              non-technical
            </span>
          )}
        </span>
        <span className="text-sm text-subtle">
          {[job.companyName, job.location, job.workplaceType].filter(Boolean).join(" \u2022 ")}
          {job.postedAt && <> {"\u2022"} {format(new Date(job.postedAt), "MMM d")}</>}
        </span>
      </div>
      <Form method="post" className="flex-shrink-0">
        <input type="hidden" name="intent" value="skip" />
        <input type="hidden" name="jobId" value={job.id} />
        <button
          type="submit"
          className="text-xs px-pad-2 py-pad-1 border border-line text-subtle hover:text-body hover:border-harbour-400 transition-colors"
        >
          Skip
        </button>
      </Form>
    </div>
  );
}

export default function DiscordJobs() {
  const { configured, destinations, jobs, history } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isPosting =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "post";
  const isSkippingOld =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "skip-old";

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oldJobCount = jobs.filter((j) => {
    const jobDate = j.postedAt || j.createdAt;
    return new Date(jobDate) < oneWeekAgo;
  }).length;

  const technicalJobs = jobs.filter((j) => j.isTechnical);
  const nonTechnicalJobs = jobs.filter((j) => !j.isTechnical);

  const hasFailures =
    actionData && "failures" in actionData && Array.isArray(actionData.failures) && actionData.failures.length > 0;

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-gap-1">
            <h1 className="text-2xl font-semibold text-heading">Discord Jobs</h1>
            <p className="text-subtle text-sm">Compose and post job roundups to Discord</p>
          </div>
          <div className="flex items-center gap-gap-4">
            <Link
              to="/manage/discord/events"
              className="text-sm text-subtle hover:text-body"
            >
              Events
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
            to set your bot token and add at least one jobs destination.
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
            Posted {actionData.posted} job{actionData.posted !== 1 ? "s" : ""} to{" "}
            {actionData.destinations} channel{actionData.destinations !== 1 ? "s" : ""}.
            {hasFailures && (
              <div className="mt-2 text-red-700">
                Failed to post to: {actionData.failures.map((f) => `#${f.channelName} (${f.error})`).join("; ")}
              </div>
            )}
          </div>
        )}

        {actionData && "skipped" in actionData && actionData.skipped && (
          <div className="p-pad-4 bg-soft border border-line text-body text-sm">
            Job skipped.
          </div>
        )}

        {actionData && "skippedOld" in actionData && actionData.skippedOld && (
          <div className="p-pad-4 bg-soft border border-line text-body text-sm">
            Skipped {actionData.skippedOld} job{actionData.skippedOld !== 1 ? "s" : ""} older than a
            week.
          </div>
        )}

        {actionData && "undone" in actionData && actionData.undone && (
          <div className="p-pad-4 bg-soft border border-line text-body text-sm">
            Post undone. Jobs have been requeued.
          </div>
        )}

        {configured && jobs.length === 0 && (
          <div className="p-pad-6 bg-surface border border-line text-subtle text-sm text-center rounded-panel">
            No unposted active jobs. All caught up!
          </div>
        )}

        {configured && jobs.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="post" />

            <div className="flex flex-col gap-gap-4">
              <div className="bg-surface border border-line p-pad-6 rounded-panel">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-heading">
                    Unposted Jobs ({jobs.length})
                  </h2>
                  {oldJobCount > 0 && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="skip-old" />
                      <button
                        type="submit"
                        disabled={isSkippingOld}
                        className="text-xs px-pad-3 py-pad-1-5 border border-line text-subtle hover:text-body hover:border-harbour-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isSkippingOld ? "Skipping..." : `Skip ${oldJobCount} older than a week`}
                      </button>
                    </Form>
                  )}
                </div>

                <div className="flex flex-col gap-gap-2">
                  {technicalJobs.length > 0 &&
                    technicalJobs.map((job) => <JobRow key={job.id} job={job} />)}

                  {nonTechnicalJobs.length > 0 && (
                    <>
                      {technicalJobs.length > 0 && (
                        <div className="border-t border-line pt-pad-3 mt-1">
                          <span className="text-xs font-medium text-subtle uppercase tracking-wide">
                            Non-Technical ({nonTechnicalJobs.length})
                          </span>
                        </div>
                      )}
                      {nonTechnicalJobs.map((job) => (
                        <JobRow key={job.id} job={job} />
                      ))}
                    </>
                  )}
                </div>
              </div>

              <div className="bg-surface border border-line p-pad-6 rounded-panel">
                <h2 className="text-lg font-semibold text-heading mb-4">
                  Intro Text (optional)
                </h2>
                <textarea
                  name="introText"
                  rows={3}
                  placeholder="e.g., Fresh job postings from the local tech scene!"
                  className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
                />
              </div>

              {technicalJobs.length === 0 && nonTechnicalJobs.length > 0 && (
                <div className="p-pad-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                  All selected jobs are non-technical. Consider skipping this post or waiting for
                  technical job listings.
                </div>
              )}

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
                  <div key={key} className="py-pad-3 flex items-start justify-between text-sm gap-gap-3">
                    <div className="flex flex-col gap-gap-1 min-w-0 flex-1">
                      <span className="text-heading">
                        {isSkip
                          ? `Skipped ${batch.skippedCount} job${batch.skippedCount !== 1 ? "s" : ""}`
                          : `Posted ${batch.itemCount} job${batch.itemCount !== 1 ? "s" : ""} to ${channelCount} channel${channelCount !== 1 ? "s" : ""}`}
                      </span>
                      {batch.introText && (
                        <span className="text-subtle text-xs truncate">
                          {batch.introText}
                        </span>
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
                            if (!confirm("Undo this post? Jobs will be requeued for posting.")) {
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
