import type { Route } from "./+types/review";
import { Link, useFetcher, useLoaderData } from "react-router";
import { db } from "~/db";
import { events } from "~/db/schema";
import {
  approveImportedEvent,
  downloadAndSaveCoverImage,
  getAllPendingEvents,
  hideImportedEvent,
} from "~/lib/event-importers/sync.server";
import {
  approveJob,
  approveJobAsNonTechnical,
  getAllPendingJobs,
  hideImportedJob,
} from "~/lib/job-importers/sync.server";
import {
  approveNewsItem,
  getAllPendingNews,
  hideNewsItem,
} from "~/lib/news-importers/sync.server";
import { requireAdmin } from "~/lib/session.server";
import { eq } from "drizzle-orm";
import { formatInTimezone } from "~/lib/timezone";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Review Queue - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [pendingEvents, pendingNews, pendingJobs] = await Promise.all([
    getAllPendingEvents(),
    getAllPendingNews(),
    getAllPendingJobs(),
  ]);
  return { pendingEvents, pendingNews, pendingJobs };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const kind = String(formData.get("kind"));
  const reviewAction = String(formData.get("action"));
  const id = Number(formData.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return { success: false, error: "A valid item ID is required." };
  }

  if (kind === "event") {
    if (reviewAction === "approve") {
      const coverImageUrl = String(formData.get("coverImageUrl") || "");
      if (coverImageUrl) {
        const savedImage = await downloadAndSaveCoverImage(coverImageUrl);
        if (savedImage) {
          await db
            .update(events)
            .set({ coverImage: savedImage, updatedAt: new Date() })
            .where(eq(events.id, id));
        }
      }
      await approveImportedEvent(id);
      return { success: true, kind, reviewAction };
    }
    if (reviewAction === "hide") {
      await hideImportedEvent(id);
      return { success: true, kind, reviewAction };
    }
  }

  if (kind === "news") {
    if (reviewAction === "approve") await approveNewsItem(id);
    else if (reviewAction === "hide") await hideNewsItem(id);
    else return { success: false, error: "Unknown news review action." };
    return { success: true, kind, reviewAction };
  }

  if (kind === "job") {
    if (reviewAction === "approve") await approveJob(id);
    else if (reviewAction === "approve-non-technical") await approveJobAsNonTechnical(id);
    else if (reviewAction === "hide") await hideImportedJob(id);
    else return { success: false, error: "Unknown job review action." };
    return { success: true, kind, reviewAction };
  }

  return { success: false, error: "Unknown review action." };
}

function ReviewButton({
  kind,
  id,
  action: reviewAction,
  children,
  tone,
  extraFields,
}: {
  kind: "event" | "news" | "job";
  id: number;
  action: string;
  children: React.ReactNode;
  tone: "approve" | "secondary" | "hide";
  extraFields?: Record<string, string>;
}) {
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state !== "idle";
  const tones = {
    approve: "border-green-200 text-green-700 hover:bg-green-50",
    secondary: "border-amber-200 text-amber-700 hover:bg-amber-50",
    hide: "border-red-200 text-red-700 hover:bg-red-50",
  };

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={reviewAction} />
      {Object.entries(extraFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        disabled={isSubmitting}
        className={`border px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
      >
        {isSubmitting ? "Working…" : children}
      </button>
    </fetcher.Form>
  );
}

function QueueSection({
  title,
  count,
  manageTo,
  children,
}: {
  title: string;
  count: number;
  manageTo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col border border-harbour-200 bg-white">
      <header className="flex items-center justify-between border-b border-harbour-200 bg-harbour-50 px-3 py-2">
        <h2 className="font-semibold text-harbour-700">
          {title} <span className="ml-1 text-xs font-normal text-harbour-500">{count}</span>
        </h2>
        <Link to={manageTo} className="text-xs text-harbour-500 hover:text-harbour-700">
          Manage all
        </Link>
      </header>
      <div className="divide-y divide-harbour-100 xl:overflow-y-auto">{children}</div>
    </section>
  );
}

function EmptyQueue() {
  return <p className="p-6 text-center text-sm text-harbour-400">Nothing pending.</p>;
}

export default function ManageReview() {
  const { pendingEvents, pendingNews, pendingJobs } = useLoaderData<typeof loader>();
  const total = pendingEvents.length + pendingNews.length + pendingJobs.length;

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold text-harbour-700">Review Queue</h1>
          <p className="mt-1 text-sm text-harbour-500">
            {total === 0 ? "Everything is reviewed." : `${total} items waiting for review.`}
          </p>
        </div>

        <div className="grid gap-4 xl:max-h-[calc(100vh-10rem)] xl:grid-cols-3">
          <QueueSection title="Events" count={pendingEvents.length} manageTo="/manage/events">
            {pendingEvents.length === 0 ? (
              <EmptyQueue />
            ) : (
              pendingEvents.map((event) => (
                <article key={event.id} className="flex flex-col gap-2 p-3">
                  <div>
                    <h3 className="font-medium text-harbour-700">{event.title}</h3>
                    <p className="text-xs text-harbour-400">
                      {[event.organizer || event.sourceName, event.location]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                    {event.startDate && (
                      <p className="text-xs text-harbour-500">
                        {formatInTimezone(event.startDate, "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <a
                      href={event.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border border-harbour-200 px-2 py-1 text-xs text-harbour-600 hover:bg-harbour-50"
                    >
                      View
                    </a>
                    <ReviewButton
                      kind="event"
                      id={event.id}
                      action="approve"
                      tone="approve"
                      extraFields={{ coverImageUrl: event.coverImageUrl || "" }}
                    >
                      Approve
                    </ReviewButton>
                    <ReviewButton kind="event" id={event.id} action="hide" tone="hide">
                      Hide
                    </ReviewButton>
                    <Link
                      to={`/manage/events/${event.id}`}
                      className="ml-auto px-2 py-1 text-xs text-harbour-500 hover:text-harbour-700"
                    >
                      Edit
                    </Link>
                  </div>
                </article>
              ))
            )}
          </QueueSection>

          <QueueSection title="News" count={pendingNews.length} manageTo="/manage/news">
            {pendingNews.length === 0 ? (
              <EmptyQueue />
            ) : (
              pendingNews.map((item) => (
                <article key={item.id} className="flex flex-col gap-2 p-3">
                  <div>
                    <h3 className="font-medium text-harbour-700">{item.title}</h3>
                    <p className="text-xs text-harbour-400">
                      {[item.sourceName, item.sourceType].filter(Boolean).join(" • ")}
                    </p>
                    {item.excerpt && (
                      <p className="mt-1 line-clamp-2 text-xs text-harbour-500">{item.excerpt}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {item.externalUrl && (
                      <a
                        href={item.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-harbour-200 px-2 py-1 text-xs text-harbour-600 hover:bg-harbour-50"
                      >
                        View
                      </a>
                    )}
                    <ReviewButton kind="news" id={item.id} action="approve" tone="approve">
                      Publish
                    </ReviewButton>
                    <ReviewButton kind="news" id={item.id} action="hide" tone="hide">
                      Hide
                    </ReviewButton>
                    <Link
                      to={`/manage/news/${item.id}`}
                      className="ml-auto px-2 py-1 text-xs text-harbour-500 hover:text-harbour-700"
                    >
                      Edit
                    </Link>
                  </div>
                </article>
              ))
            )}
          </QueueSection>

          <QueueSection title="Jobs" count={pendingJobs.length} manageTo="/manage/jobs">
            {pendingJobs.length === 0 ? (
              <EmptyQueue />
            ) : (
              pendingJobs.map((job) => (
                <article key={job.id} className="flex flex-col gap-2 p-3">
                  <div>
                    <h3 className="font-medium text-harbour-700">{job.title}</h3>
                    <p className="text-xs text-harbour-400">
                      {[job.companyName, job.location, job.workplaceType]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {job.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-harbour-200 px-2 py-1 text-xs text-harbour-600 hover:bg-harbour-50"
                      >
                        View
                      </a>
                    )}
                    <ReviewButton kind="job" id={job.id} action="approve" tone="approve">
                      Approve
                    </ReviewButton>
                    <ReviewButton
                      kind="job"
                      id={job.id}
                      action="approve-non-technical"
                      tone="secondary"
                    >
                      Non-tech
                    </ReviewButton>
                    <ReviewButton kind="job" id={job.id} action="hide" tone="hide">
                      Hide
                    </ReviewButton>
                  </div>
                </article>
              ))
            )}
          </QueueSection>
        </div>
      </div>
    </div>
  );
}
