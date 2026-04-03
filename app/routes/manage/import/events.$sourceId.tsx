import type { Route } from "./+types/events.$sourceId";
import { Link, redirect, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getEventImportSourceWithStats,
  deleteEventImportSource,
  syncEvents,
  approveImportedEvent,
  hideImportedEvent,
  unhideImportedEvent,
  downloadAndSaveCoverImage,
} from "~/lib/event-importers/sync.server";
import { sourceTypeLabels } from "~/lib/event-importers/types";
import { db } from "~/db";
import { events as eventsTable } from "~/db/schema";
import { eq } from "drizzle-orm";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.source?.name ?? "Event Source"} - Import - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  const sourceId = Number(params.sourceId);
  if (!sourceId) throw new Response("Not Found", { status: 404 });

  const source = await getEventImportSourceWithStats(sourceId);
  if (!source) throw new Response("Not Found", { status: 404 });

  return { source };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);
  const sourceId = Number(params.sourceId);
  if (!sourceId) throw new Response("Not Found", { status: 404 });

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "sync") {
    const result = await syncEvents(sourceId);
    return { intent: "sync", ...result };
  }

  if (intent === "approve") {
    const eventId = Number(formData.get("eventId"));
    if (!eventId) return { error: "Event ID required" };

    // Download cover image if available
    const coverImageUrl = formData.get("coverImageUrl") as string | null;
    if (coverImageUrl) {
      const savedImage = await downloadAndSaveCoverImage(coverImageUrl);
      if (savedImage) {
        await db
          .update(eventsTable)
          .set({ coverImage: savedImage, updatedAt: new Date() })
          .where(eq(eventsTable.id, eventId));
      }
    }

    await approveImportedEvent(eventId);
    return redirect(`/manage/events/${eventId}`);
  }

  if (intent === "hide") {
    const eventId = Number(formData.get("eventId"));
    if (!eventId) return { error: "Event ID required" };
    await hideImportedEvent(eventId);
    return { intent: "hide", success: true };
  }

  if (intent === "unhide") {
    const eventId = Number(formData.get("eventId"));
    if (!eventId) return { error: "Event ID required" };
    await unhideImportedEvent(eventId);
    return { intent: "unhide", success: true };
  }

  if (intent === "delete-source") {
    await deleteEventImportSource(sourceId);
    return redirect("/manage/import/events");
  }

  return { error: "Unknown intent" };
}

export default function EventImportSourceDetail() {
  const { source } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isLoading = fetcher.state !== "idle";
  const actionData = fetcher.data;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <div>
          <Link
            to="/manage/import/events"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Event Import Sources
          </Link>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-harbour-700">{source.name}</h1>
            <p className="text-sm text-harbour-400 mt-1">
              {sourceTypeLabels[source.sourceType] ?? source.sourceType}
              {source.organizer ? ` · ${source.organizer}` : ""}
              {" · "}
              <a
                href={source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View source
              </a>
            </p>
          </div>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="sync" />
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-harbour-600 text-white hover:bg-harbour-700 text-sm disabled:opacity-50"
            >
              {isLoading ? "Syncing…" : "Sync Now"}
            </button>
          </fetcher.Form>
        </div>

        {source.fetchStatus === "error" && (
          <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Last sync error: {source.fetchError ?? "Unknown error"}
          </div>
        )}

        {actionData && "intent" in actionData && actionData.intent === "sync" && (
          <div className="border border-harbour-200 bg-harbour-50 p-3 text-sm text-harbour-700">
            {"success" in actionData && actionData.success
              ? `Sync complete — Added: ${"added" in actionData ? actionData.added : 0}, Skipped: ${"skipped" in actionData ? actionData.skipped : 0}, Removed: ${"removed" in actionData ? actionData.removed : 0}`
              : `Sync failed: ${"error" in actionData ? actionData.error : "Unknown error"}`}
          </div>
        )}

        {/* Pending Review */}
        <section>
          <h2 className="text-lg font-semibold text-harbour-700 mb-3 flex items-center gap-2">
            Pending Review
            {source.pending.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800">
                {source.pending.length}
              </span>
            )}
          </h2>
          {source.pending.length === 0 ? (
            <p className="text-sm text-harbour-400">No events pending review.</p>
          ) : (
            <div className="border border-harbour-200 divide-y divide-harbour-100">
              {source.pending.map((event) => (
                <div key={event.id} className="flex items-start justify-between p-4 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-harbour-700 text-sm">{event.title}</div>
                    {event.location && (
                      <div className="text-xs text-harbour-400 mt-0.5">{event.location}</div>
                    )}
                    {event.link && (
                      <a
                        href={event.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-harbour-400 underline mt-0.5 inline-block"
                      >
                        View source
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="approve" />
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="coverImageUrl" value={event.coverImageUrl ?? ""} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-3 py-1 bg-harbour-600 text-white hover:bg-harbour-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                    </fetcher.Form>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="hide" />
                      <input type="hidden" name="eventId" value={event.id} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-3 py-1 border border-harbour-200 text-harbour-500 hover:bg-harbour-50 disabled:opacity-50"
                      >
                        Hide
                      </button>
                    </fetcher.Form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Approved (Editing) */}
        {source.approved.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-harbour-700 mb-3 flex items-center gap-2">
              Approved — Editing
              <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">
                {source.approved.length}
              </span>
            </h2>
            <div className="border border-harbour-200 divide-y divide-harbour-100">
              {source.approved.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-4">
                  <div className="font-medium text-harbour-700 text-sm">{event.title}</div>
                  <div className="flex gap-2">
                    <Link
                      to={`/manage/events/${event.id}`}
                      className="text-xs px-3 py-1 border border-harbour-200 text-harbour-600 hover:bg-harbour-50"
                    >
                      Edit &amp; Publish
                    </Link>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="hide" />
                      <input type="hidden" name="eventId" value={event.id} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-3 py-1 border border-harbour-200 text-harbour-500 hover:bg-harbour-50"
                      >
                        Hide
                      </button>
                    </fetcher.Form>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Published */}
        {source.published.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-harbour-700 mb-3 flex items-center gap-2">
              Published
              <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700">
                {source.published.length}
              </span>
            </h2>
            <div className="border border-harbour-200 divide-y divide-harbour-100">
              {source.published.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-4">
                  <div className="font-medium text-harbour-700 text-sm">{event.title}</div>
                  <div className="flex gap-2">
                    <Link
                      to={`/manage/events/${event.id}`}
                      className="text-xs px-3 py-1 border border-harbour-200 text-harbour-600 hover:bg-harbour-50"
                    >
                      Edit
                    </Link>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="hide" />
                      <input type="hidden" name="eventId" value={event.id} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-3 py-1 border border-harbour-200 text-harbour-500 hover:bg-harbour-50"
                      >
                        Hide
                      </button>
                    </fetcher.Form>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Hidden */}
        {source.hidden.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-harbour-700 mb-3">Hidden</h2>
            <div className="border border-harbour-200 divide-y divide-harbour-100">
              {source.hidden.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-4">
                  <div className="font-medium text-harbour-700 text-sm">{event.title}</div>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="unhide" />
                    <input type="hidden" name="eventId" value={event.id} />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="text-xs px-3 py-1 border border-harbour-200 text-harbour-600 hover:bg-harbour-50"
                    >
                      Unhide
                    </button>
                  </fetcher.Form>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Removed */}
        {source.removed.length > 0 && (
          <details className="border border-harbour-200">
            <summary className="px-4 py-3 text-sm font-medium text-harbour-500 cursor-pointer hover:bg-harbour-50">
              Removed ({source.removed.length}) — no longer in source feed
            </summary>
            <div className="divide-y divide-harbour-100">
              {source.removed.map((event) => (
                <div key={event.id} className="px-4 py-3 text-sm text-harbour-400">
                  {event.title}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Danger zone */}
        <details className="border border-red-200">
          <summary className="px-4 py-3 text-sm font-medium text-red-600 cursor-pointer hover:bg-red-50">
            Danger Zone
          </summary>
          <div className="p-4">
            <p className="text-sm text-harbour-500 mb-3">
              Deleting this source will not delete approved or published events. Only the source
              record and pending/hidden events will be removed.
            </p>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete-source" />
              <button
                type="submit"
                className="text-xs px-3 py-1 bg-red-600 text-white hover:bg-red-700"
                onClick={(e) => {
                  if (
                    !confirm(
                      "Delete this import source? Pending and hidden events will also be removed.",
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                Delete Source
              </button>
            </fetcher.Form>
          </div>
        </details>
      </div>
    </div>
  );
}
