import { loadAdminOperation, runAdminOperation } from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";

import type { Route } from "./+types/events.$sourceId";
import { Link, redirect, useLoaderData, useFetcher } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { sourceTypeLabels } from "~/lib/event-importers/types";
import { isPast } from "date-fns";
import { formatInTimezone } from "~/lib/timezone";

function EventDate({ date }: { date: Date | string | null }) {
  if (!date) return null;
  const past = isPast(date);
  return (
    <span className={`text-xs ${past ? "text-red-500" : "text-muted"}`}>
      {formatInTimezone(new Date(date), "MMM d, yyyy")}
      {past ? " (past)" : ""}
    </span>
  );
}

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `${data?.source?.name ?? "Event Source"} - Import - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const sourceId = Number(params.sourceId);
  if (!sourceId) throw new Response("Not Found", { status: 404 });

  const source = await loadAdminOperation(request, operationCatalog.eventSourceGet, {
    id: sourceId,
  });
  if (!source) throw new Response("Not Found", { status: 404 });

  return { source };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const sourceId = Number(params.sourceId);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "sync") {
    const result = await runAdminOperation(request, operationCatalog.eventSourceSync, {
      id: sourceId,
      confirm: true,
    });
    return result.ok ? { intent: "sync", ...result.data } : { error: result.error };
  }
  if (intent === "approve" || intent === "hide" || intent === "unhide") {
    const eventId = Number(form.get("eventId"));
    const operation =
      intent === "approve"
        ? operationCatalog.eventImportApprove
        : intent === "hide"
          ? operationCatalog.eventImportHide
          : operationCatalog.eventImportUnhide;
    const result = await runAdminOperation(request, operation, { id: eventId });
    if (!result.ok) return { error: result.error };
    return intent === "approve" ? redirect(`/manage/events/${eventId}`) : { intent, success: true };
  }
  if (intent === "edit-source") {
    const result = await runAdminOperation(request, operationCatalog.eventSourceUpdate, {
      id: sourceId,
      name: form.get("name"),
      organizer: form.get("organizer") ?? null,
      sourceIdentifier: form.get("sourceIdentifier"),
      sourceUrl: form.get("sourceUrl"),
    });
    return result.ok ? { intent, success: true } : { intent, error: result.error };
  }
  if (intent === "delete-source") {
    const result = await runAdminOperation(request, operationCatalog.eventSourceDelete, {
      id: sourceId,
      confirm: true,
    });
    return result.ok ? redirect("/manage/import/events") : { error: result.error };
  }
  return { error: "Unknown intent" };
}

export default function EventImportSourceDetail() {
  const { source } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isLoading = fetcher.state !== "idle";
  const actionData = fetcher.data;

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-gap-8">
        <div>
          <Link to="/manage/import/events" className="text-sm text-subtle hover:text-body">
            &larr; Back to Event Import Sources
          </Link>
        </div>

        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-semibold text-heading">{source.name}</h1>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="sync" />
            <button
              type="submit"
              disabled={isLoading}
              className="px-pad-4 py-pad-2 bg-primary text-white hover:bg-primary-hover text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Syncing…" : "Sync Now"}
            </button>
          </fetcher.Form>
        </div>

        <fetcher.Form
          method="post"
          className="bg-surface border border-line p-pad-4 flex flex-col gap-gap-3"
        >
          <input type="hidden" name="intent" value="edit-source" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-3">
            <div>
              <label className="text-sm text-muted" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={source.name}
                className="w-full mt-1 px-pad-2 py-pad-1 text-sm border border-line focus:outline-none focus:border-harbour-400"
              />
            </div>
            <div>
              <label className="text-sm text-muted" htmlFor="organizer">
                Organizer
              </label>
              <input
                id="organizer"
                name="organizer"
                type="text"
                defaultValue={source.organizer ?? ""}
                placeholder="e.g. GDG St. John's"
                className="w-full mt-1 px-pad-2 py-pad-1 text-sm border border-line focus:outline-none focus:border-harbour-400"
              />
            </div>
            <div>
              <label className="text-sm text-muted" htmlFor="sourceIdentifier">
                Identifier
              </label>
              <input
                id="sourceIdentifier"
                name="sourceIdentifier"
                type="text"
                defaultValue={source.sourceIdentifier}
                className="w-full mt-1 px-pad-2 py-pad-1 text-sm font-mono border border-line focus:outline-none focus:border-harbour-400"
              />
            </div>
            <div>
              <label className="text-sm text-muted" htmlFor="sourceUrl">
                Source URL
              </label>
              <input
                id="sourceUrl"
                name="sourceUrl"
                type="text"
                defaultValue={source.sourceUrl}
                className="w-full mt-1 px-pad-2 py-pad-1 text-sm border border-line focus:outline-none focus:border-harbour-400"
              />
            </div>
          </div>
          <div className="flex items-center gap-gap-3">
            <button
              type="submit"
              className="px-pad-3 py-pad-1 text-sm bg-primary text-white hover:bg-primary-hover transition-colors"
            >
              Save
            </button>
            <span className="text-xs text-subtle">
              {sourceTypeLabels[source.sourceType] ?? source.sourceType}
            </span>
            {actionData &&
              "intent" in actionData &&
              actionData.intent === "edit-source" &&
              "success" in actionData && <span className="text-xs text-green-600">Saved</span>}
            {actionData &&
              "intent" in actionData &&
              actionData.intent === "edit-source" &&
              "error" in actionData && (
                <span className="text-xs text-red-600">{actionData.error}</span>
              )}
          </div>
        </fetcher.Form>

        <div className="flex flex-wrap gap-4 text-xs text-harbour-500">
          <span>
            Last success:{" "}
            {source.lastFetchedAt
              ? new Date(source.lastFetchedAt).toLocaleString("en-CA")
              : "Never"}
          </span>
          <span title="Also changes when the source is edited">
            Last attempt: {new Date(source.updatedAt).toLocaleString("en-CA")}
          </span>
        </div>
        {source.fetchStatus === "rate_limited" && (
          <div className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {source.fetchError ?? "Rate limited. Will retry next sync."}
          </div>
        )}

        {source.fetchStatus === "error" && (
          <div className="border border-red-200 bg-red-50 p-pad-3 text-sm text-red-700">
            Last sync error: {source.fetchError ?? "Unknown error"}
          </div>
        )}

        {actionData && "intent" in actionData && actionData.intent === "sync" && (
          <div className="border border-line bg-soft p-pad-3 text-sm text-heading">
            {"success" in actionData && actionData.success
              ? `Sync complete — Added: ${"added" in actionData ? actionData.added : 0}, Skipped: ${"skipped" in actionData ? actionData.skipped : 0}, Removed: ${"removed" in actionData ? actionData.removed : 0}`
              : `Sync failed: ${"error" in actionData ? actionData.error : "Unknown error"}`}
          </div>
        )}

        {/* Pending Review */}
        <section>
          <h2 className="text-lg font-semibold text-heading mb-3 flex items-center gap-gap-2">
            Pending Review
            {source.pending.length > 0 && (
              <span className="text-xs px-pad-1-5 py-pad-0-5 bg-amber-100 text-amber-800">
                {source.pending.length}
              </span>
            )}
          </h2>
          {source.pending.length === 0 ? (
            <p className="text-sm text-subtle">No events pending review.</p>
          ) : (
            <div className="border border-line divide-y divide-harbour-100">
              {source.pending.map((event) => (
                <div key={event.id} className="flex items-start justify-between p-pad-4 gap-gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-heading text-sm">{event.title}</div>
                    <div className="flex flex-wrap gap-gap-2 mt-0.5">
                      <EventDate date={event.startDate} />
                      {event.location && (
                        <span className="text-xs text-subtle">{event.location}</span>
                      )}
                    </div>
                    {event.link && (
                      <a
                        href={event.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-subtle underline mt-0.5 inline-block"
                      >
                        View source
                      </a>
                    )}
                  </div>
                  <div className="flex gap-gap-2 shrink-0">
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="approve" />
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="coverImageUrl" value={event.coverImageUrl ?? ""} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-pad-3 py-pad-1 bg-primary text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
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
                        className="text-xs px-pad-3 py-pad-1 border border-line text-muted hover:bg-soft disabled:opacity-50 disabled:cursor-not-allowed"
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
            <h2 className="text-lg font-semibold text-heading mb-3 flex items-center gap-gap-2">
              Approved — Editing
              <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-body">
                {source.approved.length}
              </span>
            </h2>
            <div className="border border-line divide-y divide-harbour-100">
              {source.approved.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-pad-4">
                  <div className="flex flex-col gap-gap-0-5">
                    <div className="font-medium text-heading text-sm">{event.title}</div>
                    <EventDate date={event.startDate} />
                  </div>
                  <div className="flex gap-gap-2">
                    <Link
                      to={`/manage/events/${event.id}`}
                      className="text-xs px-pad-3 py-pad-1 border border-line text-body hover:bg-soft"
                    >
                      Edit &amp; Publish
                    </Link>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="hide" />
                      <input type="hidden" name="eventId" value={event.id} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-pad-3 py-pad-1 border border-line text-muted hover:bg-soft"
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
            <h2 className="text-lg font-semibold text-heading mb-3 flex items-center gap-gap-2">
              Published
              <span className="text-xs px-pad-1-5 py-pad-0-5 bg-green-100 text-green-700">
                {source.published.length}
              </span>
            </h2>
            <div className="border border-line divide-y divide-harbour-100">
              {source.published.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-pad-4">
                  <div className="flex flex-col gap-gap-0-5">
                    <div className="font-medium text-heading text-sm">{event.title}</div>
                    <EventDate date={event.startDate} />
                  </div>
                  <div className="flex gap-gap-2">
                    <Link
                      to={`/manage/events/${event.id}`}
                      className="text-xs px-pad-3 py-pad-1 border border-line text-body hover:bg-soft"
                    >
                      Edit
                    </Link>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="hide" />
                      <input type="hidden" name="eventId" value={event.id} />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="text-xs px-pad-3 py-pad-1 border border-line text-muted hover:bg-soft"
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
            <h2 className="text-lg font-semibold text-heading mb-3">Hidden</h2>
            <div className="border border-line divide-y divide-harbour-100">
              {source.hidden.map((event) => (
                <div key={event.id} className="flex items-center justify-between p-pad-4">
                  <div className="flex flex-col gap-gap-0-5">
                    <div className="font-medium text-heading text-sm">{event.title}</div>
                    <EventDate date={event.startDate} />
                  </div>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="unhide" />
                    <input type="hidden" name="eventId" value={event.id} />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="text-xs px-pad-3 py-pad-1 border border-line text-body hover:bg-soft"
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
          <details className="border border-line">
            <summary className="px-pad-4 py-pad-3 text-sm font-medium text-muted cursor-pointer hover:bg-soft">
              Removed ({source.removed.length}) — no longer in source feed
            </summary>
            <div className="divide-y divide-harbour-100">
              {source.removed.map((event) => (
                <div key={event.id} className="px-pad-4 py-pad-3 text-sm text-subtle">
                  {event.title}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Danger zone */}
        <details className="border border-red-200">
          <summary className="px-pad-4 py-pad-3 text-sm font-medium text-red-600 cursor-pointer hover:bg-red-50">
            Danger Zone
          </summary>
          <div className="p-pad-4">
            <p className="text-sm text-muted mb-3">
              Deleting this source will not delete approved or published events. Only the source
              record and pending/hidden events will be removed.
            </p>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete-source" />
              <button
                type="submit"
                className="text-xs px-pad-3 py-pad-1 bg-red-600 text-white hover:bg-red-700"
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
