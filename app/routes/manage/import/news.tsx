import type { Route } from "./+types/news";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getAllNewsImportSources,
  syncNewsSource,
  syncAllNewsSources,
  getAllPendingNews,
  approveNewsItem,
  hideNewsItem,
  hideAllPendingNews,
} from "~/lib/news-importers/sync.server";
import { sourceTypeLabels } from "~/lib/news-importers/types";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const [sources, pendingNews] = await Promise.all([
    getAllNewsImportSources(),
    getAllPendingNews(),
  ]);

  return { sources, pendingNews };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync") {
    const sourceId = Number(formData.get("sourceId"));
    if (!sourceId) {
      return { success: false, error: "Source ID required" };
    }

    const result = await syncNewsSource(sourceId);
    return { intent: "sync", ...result };
  }

  if (intent === "sync-all") {
    const result = await syncAllNewsSources();
    return { intent: "sync-all", ...result };
  }

  if (intent === "review-news") {
    const newsId = Number(formData.get("newsId"));
    const reviewAction = formData.get("action") as string;
    if (!newsId) return { success: false, error: "News ID required" };

    if (reviewAction === "approve") {
      await approveNewsItem(newsId);
    } else if (reviewAction === "hide") {
      await hideNewsItem(newsId);
    }
    return { intent: "review-news", success: true };
  }

  if (intent === "hide-all-pending") {
    const count = await hideAllPendingNews();
    return { intent: "hide-all-pending", success: true, hidden: count };
  }

  return { success: false, error: "Unknown action" };
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "Never";
  return new Date(date).toLocaleString("en-CA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-harbour-400">-</span>;

  const colors: Record<string, string> = {
    success: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-700",
  };

  return (
    <span
      className={`text-xs px-1.5 py-0.5 ${colors[status] || "bg-harbour-100 text-harbour-600"}`}
    >
      {status}
    </span>
  );
}

function PendingNewsRow({
  item,
}: {
  item: {
    id: number;
    title: string;
    externalUrl: string | null;
    sourceName: string | null;
    excerpt: string | null;
    sourceType: string | null;
  };
}) {
  const fetcher = useFetcher();
  const isActing = fetcher.state !== "idle";

  return (
    <div
      className={`flex items-center gap-3 p-3 border border-harbour-200 bg-white ${isActing ? "opacity-50" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-harbour-700 truncate">{item.title}</span>
          {item.sourceName && (
            <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-500">
              {item.sourceName}
            </span>
          )}
        </div>
        {item.excerpt && (
          <p className="text-sm text-harbour-400 truncate">
            {item.excerpt.length > 120 ? item.excerpt.slice(0, 120) + "..." : item.excerpt}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {item.externalUrl && (
          <a
            href={item.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 text-xs text-harbour-500 hover:text-harbour-700 border border-harbour-200 hover:border-harbour-300"
          >
            View
          </a>
        )}
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="review-news" />
          <input type="hidden" name="newsId" value={item.id} />
          <input type="hidden" name="action" value="approve" />
          <button
            type="submit"
            disabled={isActing}
            className="px-2 py-1 text-xs text-green-700 hover:bg-green-50 border border-green-200 hover:border-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Approve
          </button>
        </fetcher.Form>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="review-news" />
          <input type="hidden" name="newsId" value={item.id} />
          <input type="hidden" name="action" value="hide" />
          <button
            type="submit"
            disabled={isActing}
            className="px-2 py-1 text-xs text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Hide
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}

export default function ManageImportNews() {
  const { sources, pendingNews } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const isLoading = fetcher.state !== "idle";
  const activeIntent = fetcher.formData?.get("intent");
  const activeSourceId = Number(fetcher.formData?.get("sourceId"));
  const isSyncAllLoading = isLoading && activeIntent === "sync-all";
  const syncResult =
    fetcher.data && "intent" in fetcher.data && fetcher.data.intent === "sync"
      ? fetcher.data
      : null;
  const syncAllResult =
    fetcher.data && "intent" in fetcher.data && fetcher.data.intent === "sync-all"
      ? fetcher.data
      : null;

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-harbour-700">Import News Sources</h1>
          <div className="flex items-center gap-2">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="sync-all" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                {isSyncAllLoading ? "Syncing All..." : "Sync All"}
              </button>
            </fetcher.Form>
            <Link
              to="/manage/import/news/new"
              className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
            >
              Add Source
            </Link>
          </div>
        </div>

        {syncResult && (
          <div
            className={`p-4 ${syncResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
          >
            {syncResult.success ? (
              <div>
                <p className="font-medium text-green-700">Sync completed</p>
                <p className="text-sm text-green-600">
                  Added: {syncResult.added}, Updated: {syncResult.updated}, Filtered:{" "}
                  {syncResult.filtered}
                </p>
                <p className="text-sm text-green-600">
                  Total published: {syncResult.totalPublished}
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-red-700">Sync failed</p>
                <p className="text-sm text-red-600">{syncResult.error}</p>
              </div>
            )}
          </div>
        )}

        {syncAllResult && (
          <div
            className={`p-4 ${syncAllResult.sourcesFailed === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}
          >
            <p
              className={`font-medium ${syncAllResult.sourcesFailed === 0 ? "text-green-700" : "text-amber-700"}`}
            >
              Sync All completed: {syncAllResult.sourcesSucceeded}/{syncAllResult.sourcesTotal}{" "}
              sources succeeded
            </p>
            <p
              className={`text-sm ${syncAllResult.sourcesFailed === 0 ? "text-green-600" : "text-amber-600"}`}
            >
              Added: {syncAllResult.added}, Updated: {syncAllResult.updated}, Filtered:{" "}
              {syncAllResult.filtered}
            </p>
            {syncAllResult.errors && syncAllResult.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium text-red-700">
                  {syncAllResult.sourcesFailed} source(s) failed:
                </p>
                <ul className="text-sm text-red-600 list-disc list-inside">
                  {syncAllResult.errors.map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Pending news triage */}
        {pendingNews.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-harbour-700">
                Pending Review ({pendingNews.length})
              </h2>
              <fetcher.Form
                method="post"
                onSubmit={(e) => {
                  if (!confirm(`Hide all ${pendingNews.length} pending news items?`)) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="hide-all-pending" />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Hide All Remaining
                </button>
              </fetcher.Form>
            </div>
            <div className="flex flex-col gap-1">
              {pendingNews.map((item) => (
                <PendingNewsRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Sources table */}
        {sources.length === 0 ? (
          <div className="p-8 border border-harbour-200 bg-harbour-50 text-center">
            <p className="text-harbour-600 mb-4">No news import sources configured yet.</p>
            <Link
              to="/manage/import/news/new"
              className="text-harbour-600 hover:text-harbour-700 underline"
            >
              Add your first source
            </Link>
          </div>
        ) : (
          <div className="border border-harbour-200 bg-white overflow-x-auto">
            <table className="w-full">
              <thead className="bg-harbour-50 border-b border-harbour-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Keywords
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Last Sync
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-harbour-600">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-harbour-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {sources.map((source) => {
                  const isThisRowSyncing =
                    isLoading && activeIntent === "sync" && activeSourceId === source.id;

                  return (
                    <tr key={source.id} className="hover:bg-harbour-50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/manage/import/news/${source.id}`}
                          className="font-medium text-harbour-700 hover:text-harbour-500"
                        >
                          {source.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">
                          {sourceTypeLabels[source.sourceType as keyof typeof sourceTypeLabels] ||
                            source.sourceType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-harbour-400">
                        {source.keywords || (
                          <span className="text-harbour-300">all</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-harbour-400">
                        {formatDate(source.lastSyncAt)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={source.lastSyncStatus} />
                        {source.lastSyncError && (
                          <span
                            className="ml-1 text-red-500 cursor-help"
                            title={source.lastSyncError}
                          >
                            !
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <fetcher.Form method="post" className="inline">
                          <input type="hidden" name="intent" value="sync" />
                          <input type="hidden" name="sourceId" value={source.id} />
                          <button
                            type="submit"
                            disabled={isLoading}
                            className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white transition-colors"
                          >
                            {isThisRowSyncing ? "..." : "Sync"}
                          </button>
                        </fetcher.Form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-sm text-harbour-400">
          News import sources let you automatically pull news links from RSS feeds and other
          sources.
        </p>

        <div>
          <Link to="/manage/news" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to News
          </Link>
        </div>
      </div>
    </div>
  );
}
