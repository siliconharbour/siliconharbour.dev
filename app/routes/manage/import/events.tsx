import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/events";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getAllEventImportSources } from "~/lib/event-importers/sync.server";
import { sourceTypeLabels } from "~/lib/event-importers/types";
import { formatDistanceToNow } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import Events - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const sources = await getAllEventImportSources();
  return { sources };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent !== "sync" && intent !== "sync-all")
    return { success: false, error: "Unknown intent" };
  if (intent === "sync") {
    const sourceId = Number(form.get("sourceId"));
    const result = await runAdminOperation(request, operationCatalog.eventSourceSync, {
      id: sourceId,
      confirm: true,
    });
    return result.ok
      ? { intent: "sync", sourceId, ...result.data }
      : { intent: "sync", success: false, error: result.error };
  }
  const result = await runAdminOperation(request, operationCatalog.eventSourceSyncAll, {
    confirm: true,
  });
  return result.ok
    ? { intent: "sync-all", ...result.data }
    : { intent: "sync-all", success: false, error: result.error };
}

export default function ImportEvents() {
  const { sources } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const actionData = fetcher.data;
  const isLoading = fetcher.state !== "idle";

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage" className="text-sm text-subtle hover:text-body">
            &larr; Back to Manage
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-gap-2">
          <h1 className="text-2xl font-semibold text-heading">Event Import Sources</h1>
          <div className="flex gap-gap-2">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="sync-all" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-pad-4 py-pad-2 bg-primary text-white hover:bg-primary-hover text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Syncing..." : "Sync All"}
              </button>
            </fetcher.Form>
            <Link
              to="/manage/import/events/new"
              className="px-pad-4 py-pad-2 border border-line text-heading hover:bg-soft text-sm"
            >
              Add Source
            </Link>
          </div>
        </div>

        {actionData && ("added" in actionData || "error" in actionData) && (
          <div className="border border-line bg-soft p-pad-3 text-sm text-heading">
            {"success" in actionData && actionData.success
              ? `Sync complete — Added: ${"added" in actionData ? actionData.added : 0}, Skipped: ${"skipped" in actionData ? actionData.skipped : 0}, Removed: ${"removed" in actionData ? actionData.removed : 0}`
              : `Error: ${"error" in actionData ? actionData.error : "Unknown error"}`}
          </div>
        )}

        {sources.length === 0 ? (
          <div className="border border-line p-pad-8 text-center text-subtle text-sm">
            No event import sources configured.{" "}
            <Link to="/manage/import/events/new" className="underline">
              Add one
            </Link>
            .
          </div>
        ) : (
          <div className="border border-line overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-soft">
                <tr className="border-b border-line">
                  <th className="text-left px-pad-4 py-pad-3 text-body font-medium">Name</th>
                  <th className="text-left px-pad-4 py-pad-3 text-body font-medium">Type</th>
                  <th className="text-left px-pad-4 py-pad-3 text-body font-medium">Pending</th>
                  <th className="text-left px-pad-4 py-pad-3 text-body font-medium">Published</th>
                  <th className="text-left px-pad-4 py-pad-3 text-body font-medium">
                    Last Success
                  </th>
                  <th className="text-left px-pad-4 py-pad-3 text-body font-medium">
                    Last Attempt
                  </th>
                  <th className="text-left px-pad-4 py-pad-3 text-body font-medium">Status</th>
                  <th className="px-pad-4 py-pad-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {sources.map((source) => (
                  <tr key={source.id} className="hover:bg-soft">
                    <td className="px-pad-4 py-pad-3 font-medium text-heading">
                      <Link to={`/manage/import/events/${source.id}`} className="hover:underline">
                        {source.name}
                      </Link>
                    </td>
                    <td className="px-pad-4 py-pad-3 text-muted">
                      {sourceTypeLabels[source.sourceType] ?? source.sourceType}
                    </td>
                    <td className="px-pad-4 py-pad-3">
                      {source.pendingCount > 0 ? (
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-amber-100 text-amber-800">
                          {source.pendingCount} pending
                        </span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="px-pad-4 py-pad-3 text-muted">{source.publishedCount}</td>
                    <td className="px-pad-4 py-pad-3 text-subtle text-xs">
                      {source.lastFetchedAt
                        ? formatDistanceToNow(source.lastFetchedAt, { addSuffix: true })
                        : "Never"}
                    </td>
                    <td
                      className="px-pad-4 py-pad-3 text-subtle text-xs"
                      title="Also changes when the source is edited"
                    >
                      {formatDistanceToNow(source.updatedAt, { addSuffix: true })}
                    </td>
                    <td className="px-pad-4 py-pad-3">
                      {source.fetchStatus === "rate_limited" ? (
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-amber-100 text-amber-800">
                          rate limited
                        </span>
                      ) : source.fetchStatus === "error" ? (
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-red-100 text-red-700">
                          error
                        </span>
                      ) : source.fetchStatus === "pending" ? (
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-body">
                          pending
                        </span>
                      ) : (
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-green-100 text-green-700">
                          ok
                        </span>
                      )}
                    </td>
                    <td className="px-pad-4 py-pad-3">
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="sync" />
                        <input type="hidden" name="sourceId" value={source.id} />
                        <button
                          type="submit"
                          disabled={isLoading}
                          className="text-xs px-pad-3 py-pad-1 border border-line text-body hover:bg-soft disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Sync
                        </button>
                      </fetcher.Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
