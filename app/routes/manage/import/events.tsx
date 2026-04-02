import type { Route } from "./+types/events";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getAllEventImportSources,
  syncEvents,
} from "~/lib/event-importers/sync.server";
import { sourceTypeLabels } from "~/lib/event-importers/types";
import { formatDistanceToNow } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import Events - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const sources = await getAllEventImportSources();
  return { sources };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync") {
    const sourceId = Number(formData.get("sourceId"));
    if (!sourceId) return { success: false, error: "Source ID required", intent: "sync" };
    const result = await syncEvents(sourceId);
    return { intent: "sync", sourceId, ...result };
  }

  if (intent === "sync-all") {
    const sources = await getAllEventImportSources();
    let totalAdded = 0, totalSkipped = 0, totalRemoved = 0;
    const errors: string[] = [];

    for (const source of sources) {
      const result = await syncEvents(source.id);
      if (result.success) {
        totalAdded += result.added;
        totalSkipped += result.skipped;
        totalRemoved += result.removed;
      } else if (result.error) {
        errors.push(`${source.name}: ${result.error}`);
      }
    }

    return {
      intent: "sync-all",
      success: errors.length === 0,
      added: totalAdded,
      skipped: totalSkipped,
      removed: totalRemoved,
      errors,
    };
  }

  return { success: false, error: "Unknown intent" };
}

export default function ImportEvents() {
  const { sources } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const actionData = fetcher.data;
  const isLoading = fetcher.state !== "idle";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Manage
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">Event Import Sources</h1>
          <div className="flex gap-2">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="sync-all" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-harbour-600 text-white hover:bg-harbour-700 text-sm disabled:opacity-50"
              >
                {isLoading ? "Syncing..." : "Sync All"}
              </button>
            </fetcher.Form>
            <Link
              to="/manage/import/events/new"
              className="px-4 py-2 border border-harbour-200 text-harbour-700 hover:bg-harbour-50 text-sm"
            >
              Add Source
            </Link>
          </div>
        </div>

        {actionData && ("added" in actionData || "error" in actionData) && (
          <div className="border border-harbour-200 bg-harbour-50 p-3 text-sm text-harbour-700">
            {"success" in actionData && actionData.success
              ? `Sync complete — Added: ${"added" in actionData ? actionData.added : 0}, Skipped: ${"skipped" in actionData ? actionData.skipped : 0}, Removed: ${"removed" in actionData ? actionData.removed : 0}`
              : `Error: ${"error" in actionData ? actionData.error : "Unknown error"}`}
          </div>
        )}

        {sources.length === 0 ? (
          <div className="border border-harbour-200 p-8 text-center text-harbour-400 text-sm">
            No event import sources configured.{" "}
            <Link to="/manage/import/events/new" className="underline">
              Add one
            </Link>
            .
          </div>
        ) : (
          <div className="border border-harbour-200">
            <table className="w-full text-sm">
              <thead className="bg-harbour-50">
                <tr className="border-b border-harbour-200">
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Pending</th>
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Published</th>
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Last Fetched</th>
                  <th className="text-left px-4 py-3 text-harbour-600 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {sources.map((source) => (
                  <tr key={source.id} className="hover:bg-harbour-50">
                    <td className="px-4 py-3 font-medium text-harbour-700">
                      <Link
                        to={`/manage/import/events/${source.id}`}
                        className="hover:underline"
                      >
                        {source.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-harbour-500">
                      {sourceTypeLabels[source.sourceType] ?? source.sourceType}
                    </td>
                    <td className="px-4 py-3">
                      {source.pendingCount > 0 ? (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800">
                          {source.pendingCount} pending
                        </span>
                      ) : (
                        <span className="text-harbour-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-harbour-500">{source.publishedCount}</td>
                    <td className="px-4 py-3 text-harbour-400 text-xs">
                      {source.lastFetchedAt
                        ? formatDistanceToNow(source.lastFetchedAt, { addSuffix: true })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      {source.fetchStatus === "error" ? (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700">error</span>
                      ) : source.fetchStatus === "pending" ? (
                        <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">pending</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700">ok</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="sync" />
                        <input type="hidden" name="sourceId" value={source.id} />
                        <button
                          type="submit"
                          disabled={isLoading}
                          className="text-xs px-3 py-1 border border-harbour-200 text-harbour-600 hover:bg-harbour-50 disabled:opacity-50"
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
