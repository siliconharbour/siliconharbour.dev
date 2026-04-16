import type { Route } from "./+types/jobs";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getDiscordConfig } from "~/lib/config.server";
import {
  getUnpostedJobs,
  createDiscordPost,
  skipItems,
  getPostHistory,
} from "~/lib/discord-posts.server";
import { buildJobsMessage } from "~/lib/discord-messages.server";
import { postMessage } from "~/lib/discord.server";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Discord Jobs - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [config, unpostedJobs, history] = await Promise.all([
    getDiscordConfig(),
    getUnpostedJobs(),
    getPostHistory("jobs"),
  ]);

  return {
    configured: Boolean(config.botToken && config.jobsChannelId),
    jobs: unpostedJobs,
    history,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const config = await getDiscordConfig();

  if (!config.botToken || !config.jobsChannelId) {
    return {
      error: "Discord is not configured. Please set bot token and jobs channel ID in Settings.",
    };
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
      discordChannelId: config.jobsChannelId,
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
      discordChannelId: config.jobsChannelId,
      itemIds: [jobId],
      itemType: "job",
    });
    return { success: true, skipped: true };
  }

  if (intent === "post") {
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

    const components = buildJobsMessage(jobsForMessage, introText || undefined);
    const result = await postMessage(config.jobsChannelId, components, config.botToken);

    if (!result.success) {
      return { error: `Failed to post to Discord: ${result.error}` };
    }

    await createDiscordPost({
      channelType: "jobs",
      discordMessageId: result.messageId || null,
      discordChannelId: config.jobsChannelId,
      introText,
      itemIds: selectedIds,
      itemType: "job",
    });

    return { success: true, posted: selectedJobs.length };
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
          {job.postedAt && <> \u2022 {format(new Date(job.postedAt), "MMM d")}</>}
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
  const { configured, jobs, history } = useLoaderData<typeof loader>();
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
            to set your bot token and jobs channel ID.
          </div>
        )}

        {actionData && "error" in actionData && actionData.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
            {actionData.error}
          </div>
        )}

        {actionData && "posted" in actionData && actionData.posted && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-700 text-sm">
            Posted {actionData.posted} job
            {actionData.posted !== 1 ? "s" : ""} to Discord.
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
                        className="text-xs px-3 py-1.5 border border-harbour-200 text-harbour-400 hover:text-harbour-600 hover:border-harbour-400 transition-colors disabled:opacity-60"
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
              {history.map((post) => (
                <div key={post.id} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-harbour-700">
                      {post.discordMessageId
                        ? `Posted ${post.itemCount} job${post.itemCount !== 1 ? "s" : ""}`
                        : `Skipped ${post.skippedCount} job${post.skippedCount !== 1 ? "s" : ""}`}
                    </span>
                    {post.introText && (
                      <span className="text-harbour-400 text-xs truncate max-w-sm">
                        {post.introText}
                      </span>
                    )}
                  </div>
                  <span className="text-harbour-400 text-xs">
                    {format(new Date(post.postedAt), "MMM d, yyyy 'at' h:mm a")}
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
