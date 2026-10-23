import { loadAllAdminItems, runAdminOperation } from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";

import type { Route } from "./+types/news";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { sourceTypeLabels } from "~/lib/news-importers/types";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const [sources, pendingNews] = await Promise.all([
    loadAllAdminItems(request, operationCatalog.newsSourceList),
    loadAllAdminItems(request, operationCatalog.newsList, { status: "pending_review" }),
  ]);

  return { sources, pendingNews };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "sync") {
    const result = await runAdminOperation(request, operationCatalog.newsSourceSync, {
      id: Number(form.get("sourceId")),
      confirm: true,
    });
    return result.ok
      ? ({ intent: "sync" as const, ...result.data } as const)
      : ({ success: false, error: result.error } as const);
  }
  if (intent === "sync-all") {
    const result = await runAdminOperation(request, operationCatalog.newsSourceSyncAll, {
      confirm: true,
    });
    return result.ok
      ? ({ intent: "sync-all" as const, ...result.data } as const)
      : ({ success: false, error: result.error } as const);
  }
  if (intent === "review-news") {
    const review = form.get("action");
    const operation =
      review === "approve"
        ? operationCatalog.newsApprove
        : review === "hide"
          ? operationCatalog.newsHide
          : null;
    if (!operation) return { success: false, error: "Unknown review action" } as const;
    const result = await runAdminOperation(request, operation, { id: Number(form.get("newsId")) });
    return result.ok
      ? ({ intent: "review-news" as const, success: true } as const)
      : ({ success: false, error: result.error } as const);
  }
  if (intent === "hide-all-pending") {
    const result = await runAdminOperation(request, operationCatalog.newsHideAllPending, {
      confirm: true,
    });
    return result.ok
      ? ({ intent: "hide-all-pending" as const, success: true, ...result.data } as const)
      : ({ success: false, error: result.error } as const);
  }
  return { success: false, error: "Unknown action" } as const;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "Never";
  return new Date(date).toLocaleString("en-CA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-subtle">-</span>;

  const colors: Record<string, string> = {
    success: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-700",
  };

  return (
    <span className={`text-xs px-pad-1-5 py-pad-0-5 ${colors[status] || "bg-tint text-body"}`}>
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
  };
}) {
  const fetcher = useFetcher();
  const isActing = fetcher.state !== "idle";

  return (
    <div
      className={`flex items-center gap-gap-3 p-pad-3 border border-line bg-surface ${isActing ? "opacity-50" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-gap-2">
          <span className="font-medium text-heading truncate">{item.title}</span>
          {item.sourceName && (
            <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-muted">
              {item.sourceName}
            </span>
          )}
        </div>
        {item.excerpt && (
          <p className="text-sm text-subtle truncate">
            {item.excerpt.length > 120 ? item.excerpt.slice(0, 120) + "..." : item.excerpt}
          </p>
        )}
      </div>
      <div className="flex items-center gap-gap-1 shrink-0">
        {item.externalUrl && (
          <a
            href={item.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-pad-2 py-pad-1 text-xs text-muted hover:text-heading border border-line hover:border-harbour-300"
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
            className="px-pad-2 py-pad-1 text-xs text-green-700 hover:bg-green-50 border border-green-200 hover:border-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="px-pad-2 py-pad-1 text-xs text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
    fetcher.data &&
    "intent" in fetcher.data &&
    fetcher.data.intent === "sync-all" &&
    "sourcesTotal" in fetcher.data
      ? fetcher.data
      : null;

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-gap-6">
        <div className="flex flex-wrap items-center justify-between gap-gap-2">
          <h1 className="text-2xl font-semibold text-heading">Import News Sources</h1>
          <div className="flex items-center gap-gap-2">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="sync-all" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-pad-4 py-pad-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                {isSyncAllLoading ? "Syncing All..." : "Sync All"}
              </button>
            </fetcher.Form>
            <Link
              to="/manage/import/news/new"
              className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
            >
              Add Source
            </Link>
          </div>
        </div>

        {syncResult && (
          <div
            className={`p-pad-4 ${syncResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
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
            className={`p-pad-4 ${syncAllResult.sourcesFailed === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}
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
                  {syncAllResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Pending news triage */}
        {pendingNews.length > 0 && (
          <div className="flex flex-col gap-gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-heading">
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
                  className="px-pad-3 py-pad-1-5 text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Hide All Remaining
                </button>
              </fetcher.Form>
            </div>
            <div className="flex flex-col gap-gap-1">
              {pendingNews.map((item) => (
                <PendingNewsRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Sources table */}
        {sources.length === 0 ? (
          <div className="p-pad-8 border border-line bg-soft text-center">
            <p className="text-body mb-4">No news import sources configured yet.</p>
            <Link to="/manage/import/news/new" className="text-body hover:text-heading underline">
              Add your first source
            </Link>
          </div>
        ) : (
          <div className="border border-line bg-surface overflow-x-auto rounded-panel">
            <table className="w-full">
              <thead className="bg-soft border-b border-line">
                <tr>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Name
                  </th>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Type
                  </th>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Keywords
                  </th>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Last Sync
                  </th>
                  <th className="px-pad-4 py-pad-3 text-center text-sm font-medium text-body">
                    Status
                  </th>
                  <th className="px-pad-4 py-pad-3 text-right text-sm font-medium text-body">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {sources.map((source) => {
                  const isThisRowSyncing =
                    isLoading && activeIntent === "sync" && activeSourceId === source.id;

                  return (
                    <tr key={source.id} className="hover:bg-soft">
                      <td className="px-pad-4 py-pad-3">
                        <Link
                          to={`/manage/import/news/${source.id}`}
                          className="font-medium text-heading hover:text-muted"
                        >
                          {source.name}
                        </Link>
                      </td>
                      <td className="px-pad-4 py-pad-3">
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-body">
                          {sourceTypeLabels[source.sourceType as keyof typeof sourceTypeLabels] ||
                            source.sourceType}
                        </span>
                      </td>
                      <td className="px-pad-4 py-pad-3 text-sm text-subtle">
                        {source.keywords || <span className="text-harbour-300">all</span>}
                      </td>
                      <td className="px-pad-4 py-pad-3 text-sm text-subtle">
                        {formatDate(source.lastSyncAt)}
                      </td>
                      <td className="px-pad-4 py-pad-3 text-center">
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
                      <td className="px-pad-4 py-pad-3 text-right">
                        <fetcher.Form method="post" className="inline">
                          <input type="hidden" name="intent" value="sync" />
                          <input type="hidden" name="sourceId" value={source.id} />
                          <button
                            type="submit"
                            disabled={isLoading}
                            className="px-pad-2 py-pad-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white transition-colors"
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

        <p className="text-sm text-subtle">
          News import sources let you automatically pull news links from RSS feeds and other
          sources.
        </p>

        <div>
          <Link to="/manage/news" className="text-sm text-subtle hover:text-body">
            &larr; Back to News
          </Link>
        </div>
      </div>
    </div>
  );
}
