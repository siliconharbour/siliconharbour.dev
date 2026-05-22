import type { Route } from "./+types/jobs";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAuth } from "~/lib/session.server";
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
import { postMessage } from "~/lib/discord.server";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Discord Jobs - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
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
  await requireAuth(request);
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

    for (const destination of destinations) {
      const messageIds: string[] = [];
      let chunkError: string | null = null;
      for (const components of messages) {
        const result = await postMessage(destination.channelId, components, config.botToken);
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
    <div className="flex items-start gap-4 p-4 border border-harbour-100">
      <input
        type="checkbox"
        name="selectedJobs"
        value={job.id}
        defaultChecked
        className="mt-1 h-4 w-4 text-harbour-600 border border-harbour-300 focus:ring-harbour-500"
      />
      <div className="flex-1 flex flex-col gap-1">
        <span className="font-medium text-harbour-700">
          {job.title}
          {!job.isTechnical && (
            <span className="ml-2 text-xs px-1.5 py-0.5 bg-harbour-50 text-harbour-400">
              non-technical
            </span>
          )}
        </span>
        <span className="text-sm text-harbour-400">
          {[job.companyName, job.location, job.workplaceType].filter(Boolean).join(" \u2022 ")}
          {job.postedAt && <> {"\u2022"} {format(new Date(job.postedAt), "MMM d")}</>}
        </span>
      </div>
      <Form method="post" className="flex-shrink-0">
        <input type="hidden" name="intent" value="skip" />
        <input type="hidden" name="jobId" value={job.id} />
        <button
          type="submit"
          className="text-xs px-2 py-1 border border-harbour-200 text-harbour-400 hover:text-harbour-600 hover:border-harbour-400 transition-colors"
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
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-harbour-700">Discord Jobs</h1>
            <p className="text-harbour-400 text-sm">Compose and post job roundups to Discord</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/manage/discord/events"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              Events
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
            to set your bot token and add at least one jobs destination.
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
          <div className="p-4 bg-harbour-50 border border-harbour-200 text-harbour-600 text-sm">
            Job skipped.
          </div>
        )}

        {actionData && "skippedOld" in actionData && actionData.skippedOld && (
          <div className="p-4 bg-harbour-50 border border-harbour-200 text-harbour-600 text-sm">
            Skipped {actionData.skippedOld} job{actionData.skippedOld !== 1 ? "s" : ""} older than a
            week.
          </div>
        )}

        {actionData && "undone" in actionData && actionData.undone && (
          <div className="p-4 bg-harbour-50 border border-harbour-200 text-harbour-600 text-sm">
            Post undone. Jobs have been requeued.
          </div>
        )}

        {configured && jobs.length === 0 && (
          <div className="p-6 bg-white border border-harbour-200 text-harbour-400 text-sm text-center">
            No unposted active jobs. All caught up!
          </div>
        )}

        {configured && jobs.length > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="post" />

            <div className="flex flex-col gap-4">
              <div className="bg-white border border-harbour-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-harbour-700">
                    Unposted Jobs ({jobs.length})
                  </h2>
                  {oldJobCount > 0 && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="skip-old" />
                      <button
                        type="submit"
                        disabled={isSkippingOld}
                        className="text-xs px-3 py-1.5 border border-harbour-200 text-harbour-400 hover:text-harbour-600 hover:border-harbour-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isSkippingOld ? "Skipping..." : `Skip ${oldJobCount} older than a week`}
                      </button>
                    </Form>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {technicalJobs.length > 0 &&
                    technicalJobs.map((job) => <JobRow key={job.id} job={job} />)}

                  {nonTechnicalJobs.length > 0 && (
                    <>
                      {technicalJobs.length > 0 && (
                        <div className="border-t border-harbour-200 pt-3 mt-1">
                          <span className="text-xs font-medium text-harbour-400 uppercase tracking-wide">
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

              <div className="bg-white border border-harbour-200 p-6">
                <h2 className="text-lg font-semibold text-harbour-700 mb-4">
                  Intro Text (optional)
                </h2>
                <textarea
                  name="introText"
                  rows={3}
                  placeholder="e.g., Fresh job postings from the local tech scene!"
                  className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
                />
              </div>

              {technicalJobs.length === 0 && nonTechnicalJobs.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                  All selected jobs are non-technical. Consider skipping this post or waiting for
                  technical job listings.
                </div>
              )}

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
                const isSkip =
                  batch.destinations.every((d) => d.discordMessageId === null) && !batch.batchId;
                const channelCount = batch.destinations.length;
                return (
                  <div key={key} className="py-3 flex items-start justify-between text-sm gap-3">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span className="text-harbour-700">
                        {isSkip
                          ? `Skipped ${batch.skippedCount} job${batch.skippedCount !== 1 ? "s" : ""}`
                          : `Posted ${batch.itemCount} job${batch.itemCount !== 1 ? "s" : ""} to ${channelCount} channel${channelCount !== 1 ? "s" : ""}`}
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
                            <input
                              type="hidden"
                              name="postId"
                              value={batch.destinations[0]?.id ?? ""}
                            />
                          </>
                        )}
                        <button
                          type="submit"
                          className="text-xs px-2 py-1 border border-harbour-200 text-harbour-400 hover:text-red-600 hover:border-red-300 transition-colors"
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
