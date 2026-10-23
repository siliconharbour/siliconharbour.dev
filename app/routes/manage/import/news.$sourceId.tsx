import { newsSourceFormInput } from "~/lib/admin/content-form-adapters";
import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/news.$sourceId";
import { Link, redirect, useLoaderData, useFetcher } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getNewsSourceWithItems } from "~/lib/news-importers/sync.server";
import { sourceTypeLabels, excerptModes, excerptModeLabels } from "~/lib/news-importers/types";

import { format } from "date-fns";

function NewsItemRow({
  item,
  actions,
}: {
  item: {
    id: number;
    title: string;
    externalUrl: string | null;
    excerpt: string | null;
    publishedAt: Date | null;
    slug: string;
  };
  actions: { label: string; value: string; className: string }[];
}) {
  const fetcher = useFetcher();
  const isActing = fetcher.state !== "idle";

  return (
    <div
      className={`flex items-center gap-gap-3 p-pad-3 border border-line bg-surface ${isActing ? "opacity-50" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-heading truncate">{item.title}</div>
        {item.excerpt && <p className="text-sm text-subtle line-clamp-1 mt-0.5">{item.excerpt}</p>}
        <div className="flex items-center gap-gap-2 mt-1">
          {item.publishedAt && (
            <span className="text-xs text-subtle">{format(item.publishedAt, "MMM d, yyyy")}</span>
          )}
        </div>
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
        <Link
          to={`/news/${item.slug}`}
          className="px-pad-2 py-pad-1 text-xs text-muted hover:text-heading border border-line hover:border-harbour-300"
        >
          Page
        </Link>
        {actions.map((action) => (
          <fetcher.Form method="post" key={action.value}>
            <input type="hidden" name="intent" value={action.value} />
            <input type="hidden" name="newsId" value={item.id} />
            <button
              type="submit"
              disabled={isActing}
              className={`px-pad-2 py-pad-1 text-xs border disabled:opacity-50 disabled:cursor-not-allowed ${action.className}`}
            >
              {action.label}
            </button>
          </fetcher.Form>
        ))}
      </div>
    </div>
  );
}

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `${data?.source?.name ?? "News Source"} - Import - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const sourceId = Number(params.sourceId);
  if (!sourceId) throw new Response("Not Found", { status: 404 });

  const source = await getNewsSourceWithItems(sourceId);
  if (!source) throw new Response("Not Found", { status: 404 });

  return { source };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const id = Number(params.sourceId);
  const intent = form.get("intent");
  if (intent === "sync") {
    const result = await runAdminOperation(request, operationCatalog.newsSourceSync, {
      id,
      confirm: true,
    });
    return result.ok
      ? ({ intent: "sync" as const, ...result.data } as const)
      : ({ error: result.error } as const);
  }
  if (intent === "approve" || intent === "hide" || intent === "unhide") {
    const operation =
      intent === "approve"
        ? operationCatalog.newsApprove
        : intent === "hide"
          ? operationCatalog.newsHide
          : operationCatalog.newsUnhide;
    const result = await runAdminOperation(request, operation, { id: Number(form.get("newsId")) });
    return result.ok ? ({ intent, success: true } as const) : ({ error: result.error } as const);
  }
  if (intent === "edit-source") {
    const result = await runAdminOperation(request, operationCatalog.newsSourceUpdate, {
      id,
      ...newsSourceFormInput(form, true),
    });
    return result.ok
      ? ({ intent, success: true } as const)
      : ({ intent, error: result.error } as const);
  }
  if (intent === "test-feed") {
    const result = await runAdminOperation(request, operationCatalog.newsSourceTestFeed, {
      id,
      ...(form.get("excerptMode") && { excerptMode: form.get("excerptMode") }),
      confirm: true,
    });
    return result.ok
      ? ({ intent: "test-feed" as const, success: true, ...result.data } as const)
      : ({ intent: "test-feed" as const, error: result.error } as const);
  }
  if (intent === "delete-source") {
    const result = await runAdminOperation(request, operationCatalog.newsSourceDelete, {
      id,
      confirm: true,
    });
    return result.ok ? redirect("/manage/import/news") : ({ error: result.error } as const);
  }
  return { error: "Unknown intent" } as const;
}

export default function NewsImportSourceDetail() {
  const { source } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isLoading = fetcher.state !== "idle";
  const actionData = fetcher.data;

  const syncResult =
    actionData && "intent" in actionData && actionData.intent === "sync" ? actionData : null;
  const editResult =
    actionData && "intent" in actionData && actionData.intent === "edit-source" ? actionData : null;
  const testResult =
    actionData && "intent" in actionData && actionData.intent === "test-feed" ? actionData : null;

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/import/news" className="text-sm text-subtle hover:text-body">
            &larr; Back to News Import Sources
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-heading">{source.name}</h1>
            <div className="flex items-center gap-gap-2 mt-1">
              <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-muted">
                {sourceTypeLabels[source.sourceType as keyof typeof sourceTypeLabels] ||
                  source.sourceType}
              </span>
              {!source.enabled && (
                <span className="text-xs px-pad-1-5 py-pad-0-5 bg-red-100 text-red-600">
                  Disabled
                </span>
              )}
            </div>
          </div>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="sync" />
            <button
              type="submit"
              disabled={isLoading}
              className="px-pad-4 py-pad-2 bg-primary text-white hover:bg-primary-hover text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Syncing..." : "Sync Now"}
            </button>
          </fetcher.Form>
        </div>

        {/* Sync result */}
        {syncResult && (
          <div
            className={`p-pad-4 ${syncResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
          >
            {syncResult.success ? (
              <div>
                <p className="font-medium text-green-700">Sync completed</p>
                <p className="text-sm text-green-600">
                  Added: {syncResult.added}, Updated: {syncResult.updated}
                  {syncResult.filtered > 0 && `, Filtered: ${syncResult.filtered}`}
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

        {/* Last sync info */}
        {source.lastSyncError && (
          <div className="p-pad-3 bg-red-50 border border-red-200">
            <p className="text-sm text-red-700">Last sync error: {source.lastSyncError}</p>
          </div>
        )}

        {/* Edit source settings */}
        <fetcher.Form
          method="post"
          className="bg-surface border border-line p-pad-4 flex flex-col gap-gap-3"
        >
          <input type="hidden" name="intent" value="edit-source" />
          <h2 className="font-medium text-heading">Source Settings</h2>
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
            <div>
              <label className="text-sm text-muted" htmlFor="sourceIdentifier">
                Source Identifier
              </label>
              <input
                id="sourceIdentifier"
                name="sourceIdentifier"
                type="text"
                defaultValue={source.sourceIdentifier ?? ""}
                placeholder="For custom scrapers"
                className="w-full mt-1 px-pad-2 py-pad-1 text-sm font-mono border border-line focus:outline-none focus:border-harbour-400"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted" htmlFor="keywords">
                  Keywords
                </label>
                <div className="flex items-center gap-gap-4 text-xs text-muted">
                  <label className="flex items-center gap-gap-1-5">
                    <input
                      type="checkbox"
                      name="useGlobalKeywords"
                      defaultChecked={source.useGlobalKeywords}
                      className="w-3 h-3"
                    />
                    Use global
                  </label>
                  <label className="flex items-center gap-gap-1-5">
                    <input
                      type="checkbox"
                      name="useCompanyNameFilter"
                      defaultChecked={source.useCompanyNameFilter}
                      className="w-3 h-3"
                    />
                    Company names
                  </label>
                </div>
              </div>
              <input
                id="keywords"
                name="keywords"
                type="text"
                defaultValue={source.keywords ?? ""}
                placeholder="Comma-separated, leave empty for all"
                className="w-full mt-1 px-pad-2 py-pad-1 text-sm border border-line focus:outline-none focus:border-harbour-400"
              />
            </div>
            <div>
              <label className="text-sm text-muted" htmlFor="excerptMode">
                Excerpt Mode
              </label>
              <select
                id="excerptMode"
                name="excerptMode"
                defaultValue={source.excerptMode}
                className="w-full mt-1 px-pad-2 py-pad-1 text-sm border border-line focus:outline-none focus:border-harbour-400"
              >
                {excerptModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {excerptModeLabels[mode]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted" htmlFor="entityUrl">
                Entity Page
              </label>
              <input
                id="entityUrl"
                name="entityUrl"
                type="text"
                defaultValue={source.entityUrl ?? ""}
                placeholder="/directory/companies/technl"
                className="w-full mt-1 px-pad-2 py-pad-1 text-sm border border-line focus:outline-none focus:border-harbour-400"
              />
            </div>
            <div className="flex items-end pb-pad-1">
              <label className="flex items-center gap-gap-2 text-sm text-heading">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={source.enabled}
                  className="w-4 h-4"
                />
                Enabled
              </label>
            </div>
          </div>
          <div className="flex items-center gap-gap-3">
            <button
              type="submit"
              disabled={isLoading}
              className="px-pad-3 py-pad-1 text-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
            {editResult && "success" in editResult && (
              <span className="text-xs text-green-600">Saved</span>
            )}
            {editResult && "error" in editResult && (
              <span className="text-xs text-red-600">{editResult.error}</span>
            )}
            {source.lastSyncAt && (
              <span className="text-xs text-subtle">
                Last sync: {format(source.lastSyncAt, "MMM d, yyyy h:mm a")}
              </span>
            )}
          </div>
        </fetcher.Form>

        {/* Test feed */}
        <div className="bg-surface border border-line p-pad-4 flex flex-col gap-gap-3 rounded-panel">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-heading">Test Feed</h2>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="test-feed" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-pad-3 py-pad-1 text-sm border border-line hover:border-harbour-400 text-body hover:text-heading disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Testing..." : "Test Feed"}
              </button>
            </fetcher.Form>
          </div>
          <p className="text-xs text-subtle">
            Fetch the feed and preview items with current settings. Does not import anything.
          </p>

          {testResult && "error" in testResult && (
            <div className="p-pad-3 bg-red-50 border border-red-200 text-sm text-red-700">
              {testResult.error}
            </div>
          )}

          {testResult && "items" in testResult && (
            <div className="flex flex-col gap-gap-1">
              <p className="text-sm text-green-700">Found {testResult.totalCount} items in feed</p>
              {testResult.items.map((item, i) => (
                <div
                  key={i}
                  className={`p-pad-2 border border-harbour-100 text-sm ${!item.matched ? "opacity-40" : ""}`}
                >
                  <div className="flex items-center gap-gap-2">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-heading hover:text-muted truncate"
                    >
                      {item.title}
                    </a>
                    {!item.matched && (
                      <span className="text-xs px-pad-1 py-pad-0-5 bg-tint text-subtle shrink-0">
                        filtered
                      </span>
                    )}
                  </div>
                  {item.excerpt && (
                    <p className="text-xs text-subtle line-clamp-1 mt-0.5">{item.excerpt}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-gap-3">
          {[
            { label: "Pending", count: source.counts.pending, color: "text-amber-700" },
            { label: "Published", count: source.counts.published, color: "text-green-700" },
            { label: "Hidden", count: source.counts.hidden, color: "text-muted" },
            { label: "Drafts", count: source.counts.drafts, color: "text-blue-700" },
            { label: "Total", count: source.counts.total, color: "text-heading" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-pad-3 bg-surface border border-line text-center rounded-panel"
            >
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
              <p className="text-xs text-subtle">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Pending Review */}
        {source.items.pending.length > 0 && (
          <div className="flex flex-col gap-gap-2">
            <h2 className="text-lg font-semibold text-heading">
              Pending Review ({source.counts.pending})
            </h2>
            <div className="flex flex-col gap-gap-1">
              {source.items.pending.map((item) => (
                <NewsItemRow
                  key={item.id}
                  item={item}
                  actions={[
                    {
                      label: "Approve",
                      value: "approve",
                      className:
                        "text-green-700 hover:bg-green-50 border-green-200 hover:border-green-300",
                    },
                    {
                      label: "Hide",
                      value: "hide",
                      className: "text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300",
                    },
                  ]}
                />
              ))}
            </div>
          </div>
        )}

        {/* Published */}
        {source.items.published.length > 0 && (
          <div className="flex flex-col gap-gap-2">
            <h2 className="text-lg font-semibold text-heading">
              Published ({source.counts.published})
            </h2>
            <div className="flex flex-col gap-gap-1">
              {source.items.published.map((item) => (
                <NewsItemRow
                  key={item.id}
                  item={item}
                  actions={[
                    {
                      label: "Hide",
                      value: "hide",
                      className: "text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300",
                    },
                  ]}
                />
              ))}
            </div>
          </div>
        )}

        {/* Hidden */}
        {source.items.hidden.length > 0 && (
          <details className="flex flex-col gap-gap-2">
            <summary className="text-lg font-semibold text-heading cursor-pointer">
              Hidden ({source.counts.hidden})
            </summary>
            <div className="flex flex-col gap-gap-1 mt-2">
              {source.items.hidden.map((item) => (
                <NewsItemRow
                  key={item.id}
                  item={item}
                  actions={[
                    {
                      label: "Unhide",
                      value: "unhide",
                      className: "text-body hover:bg-soft border-line hover:border-harbour-300",
                    },
                  ]}
                />
              ))}
            </div>
          </details>
        )}

        {/* Empty state */}
        {source.counts.total === 0 && (
          <div className="p-pad-8 bg-soft border border-line text-centre">
            <p className="text-muted text-center">
              No news items imported yet. Click &quot;Sync Now&quot; to fetch from this source.
            </p>
          </div>
        )}

        {/* Danger Zone */}
        <details className="border border-line bg-surface">
          <summary className="p-pad-4 text-sm font-medium text-red-700 cursor-pointer">
            Danger Zone
          </summary>
          <div className="p-pad-4 pt-pad-0">
            <fetcher.Form
              method="post"
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Delete source "${source.name}" and all its ${source.counts.total} imported items?`,
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="delete-source" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-pad-3 py-pad-1-5 text-sm text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Source & All Items
              </button>
            </fetcher.Form>
          </div>
        </details>
      </div>
    </div>
  );
}
