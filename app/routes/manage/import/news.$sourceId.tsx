import type { Route } from "./+types/news.$sourceId";
import { Link, redirect, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getNewsSourceWithItems,
  deleteNewsImportSource,
  updateNewsImportSource,
  syncNewsSource,
  approveNewsItem,
  hideNewsItem,
  unhideNewsItem,
} from "~/lib/news-importers/sync.server";
import {
  sourceTypeLabels,
  excerptModes,
  excerptModeLabels,
} from "~/lib/news-importers/types";
import type { ExcerptMode } from "~/lib/news-importers/types";
import { parseRssItems } from "~/lib/news-importers/rss.server";
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
    <div className={`flex items-center gap-3 p-3 border border-harbour-200 bg-white ${isActing ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-harbour-700 truncate">{item.title}</div>
        {item.excerpt && (
          <p className="text-sm text-harbour-400 line-clamp-1 mt-0.5">{item.excerpt}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {item.publishedAt && (
            <span className="text-xs text-harbour-400">
              {format(item.publishedAt, "MMM d, yyyy")}
            </span>
          )}
        </div>
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
        <Link
          to={`/news/${item.slug}`}
          className="px-2 py-1 text-xs text-harbour-500 hover:text-harbour-700 border border-harbour-200 hover:border-harbour-300"
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
              className={`px-2 py-1 text-xs border disabled:opacity-50 disabled:cursor-not-allowed ${action.className}`}
            >
              {action.label}
            </button>
          </fetcher.Form>
        ))}
      </div>
    </div>
  );
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.source?.name ?? "News Source"} - Import - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  const sourceId = Number(params.sourceId);
  if (!sourceId) throw new Response("Not Found", { status: 404 });

  const source = await getNewsSourceWithItems(sourceId);
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
    const result = await syncNewsSource(sourceId);
    return { intent: "sync", ...result };
  }

  if (intent === "approve") {
    const newsId = Number(formData.get("newsId"));
    if (!newsId) return { error: "News ID required" };
    await approveNewsItem(newsId);
    return { intent: "approve", success: true };
  }

  if (intent === "hide") {
    const newsId = Number(formData.get("newsId"));
    if (!newsId) return { error: "News ID required" };
    await hideNewsItem(newsId);
    return { intent: "hide", success: true };
  }

  if (intent === "unhide") {
    const newsId = Number(formData.get("newsId"));
    if (!newsId) return { error: "News ID required" };
    await unhideNewsItem(newsId);
    return { intent: "unhide", success: true };
  }

  if (intent === "edit-source") {
    const name = (formData.get("name") as string)?.trim();
    const sourceUrl = (formData.get("sourceUrl") as string)?.trim();
    const sourceIdentifier = (formData.get("sourceIdentifier") as string)?.trim() || null;
    const keywords = (formData.get("keywords") as string)?.trim() || null;
    const excerptMode = (formData.get("excerptMode") as ExcerptMode) || "description";
    const enabled = formData.has("enabled");

    if (!name) return { intent: "edit-source", error: "Name is required" };
    if (!sourceUrl) return { intent: "edit-source", error: "Source URL is required" };

    await updateNewsImportSource(sourceId, {
      name,
      sourceUrl,
      sourceIdentifier,
      keywords,
      excerptMode,
      enabled,
    });
    return { intent: "edit-source", success: true };
  }

  if (intent === "test-feed") {
    const source = await getNewsSourceWithItems(sourceId);
    if (!source) return { intent: "test-feed", error: "Source not found" };

    const excerptMode = (formData.get("excerptMode") as ExcerptMode) || source.excerptMode || "description";

    try {
      const response = await fetch(source.sourceUrl, {
        headers: {
          "User-Agent": "siliconharbour.dev news aggregator",
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
      });

      if (!response.ok) {
        return { intent: "test-feed", error: `Feed returned ${response.status} ${response.statusText}` };
      }

      const xml = await response.text();
      const allItems = parseRssItems(xml, excerptMode);

      const items = allItems.map((item) => ({
        title: item.title,
        url: item.url,
        excerpt: item.excerpt?.slice(0, 200) || null,
        publishedAt: item.publishedAt?.toISOString() || null,
        matched: source.keywords
          ? `${item.title} ${item.excerpt || ""}`.toLowerCase().split(" ").some(() => {
              const kws = source.keywords!.split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
              const text = `${item.title} ${item.excerpt || ""}`.toLowerCase();
              return kws.some((kw: string) => text.includes(kw));
            })
          : true,
      }));

      return { intent: "test-feed", success: true, items, totalCount: allItems.length };
    } catch (e) {
      return { intent: "test-feed", error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (intent === "delete-source") {
    await deleteNewsImportSource(sourceId);
    return redirect("/manage/import/news");
  }

  return { error: "Unknown intent" };
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
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage/import/news"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to News Import Sources
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-harbour-700">{source.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-500">
                {sourceTypeLabels[source.sourceType as keyof typeof sourceTypeLabels] || source.sourceType}
              </span>
              {!source.enabled && (
                <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600">Disabled</span>
              )}
            </div>
          </div>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="sync" />
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-harbour-600 text-white hover:bg-harbour-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Syncing..." : "Sync Now"}
            </button>
          </fetcher.Form>
        </div>

        {/* Sync result */}
        {syncResult && (
          <div className={`p-4 ${syncResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
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
          <div className="p-3 bg-red-50 border border-red-200">
            <p className="text-sm text-red-700">Last sync error: {source.lastSyncError}</p>
          </div>
        )}

        {/* Edit source settings */}
        <fetcher.Form method="post" className="bg-white border border-harbour-200 p-4 flex flex-col gap-3">
          <input type="hidden" name="intent" value="edit-source" />
          <h2 className="font-medium text-harbour-700">Source Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-harbour-500" htmlFor="name">Name</label>
              <input
                id="name" name="name" type="text"
                defaultValue={source.name}
                className="w-full mt-1 px-2 py-1 text-sm border border-harbour-200 focus:outline-none focus:border-harbour-400"
              />
            </div>
            <div>
              <label className="text-sm text-harbour-500" htmlFor="sourceUrl">Source URL</label>
              <input
                id="sourceUrl" name="sourceUrl" type="text"
                defaultValue={source.sourceUrl}
                className="w-full mt-1 px-2 py-1 text-sm border border-harbour-200 focus:outline-none focus:border-harbour-400"
              />
            </div>
            <div>
              <label className="text-sm text-harbour-500" htmlFor="sourceIdentifier">
                Source Identifier
              </label>
              <input
                id="sourceIdentifier" name="sourceIdentifier" type="text"
                defaultValue={source.sourceIdentifier ?? ""}
                placeholder="For custom scrapers"
                className="w-full mt-1 px-2 py-1 text-sm font-mono border border-harbour-200 focus:outline-none focus:border-harbour-400"
              />
            </div>
            <div>
              <label className="text-sm text-harbour-500" htmlFor="keywords">Keywords</label>
              <input
                id="keywords" name="keywords" type="text"
                defaultValue={source.keywords ?? ""}
                placeholder="Comma-separated, leave empty for all"
                className="w-full mt-1 px-2 py-1 text-sm border border-harbour-200 focus:outline-none focus:border-harbour-400"
              />
            </div>
            <div>
              <label className="text-sm text-harbour-500" htmlFor="excerptMode">Excerpt Mode</label>
              <select
                id="excerptMode" name="excerptMode"
                defaultValue={source.excerptMode}
                className="w-full mt-1 px-2 py-1 text-sm border border-harbour-200 focus:outline-none focus:border-harbour-400"
              >
                {excerptModes.map((mode) => (
                  <option key={mode} value={mode}>{excerptModeLabels[mode]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-harbour-700">
                <input
                  type="checkbox" name="enabled"
                  defaultChecked={source.enabled}
                  className="w-4 h-4"
                />
                Enabled
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isLoading}
              className="px-3 py-1 text-sm bg-harbour-600 text-white hover:bg-harbour-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              <span className="text-xs text-harbour-400">
                Last sync: {format(source.lastSyncAt, "MMM d, yyyy h:mm a")}
              </span>
            )}
          </div>
        </fetcher.Form>

        {/* Test feed */}
        <div className="bg-white border border-harbour-200 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-harbour-700">Test Feed</h2>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="test-feed" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-3 py-1 text-sm border border-harbour-200 hover:border-harbour-400 text-harbour-600 hover:text-harbour-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Testing..." : "Test Feed"}
              </button>
            </fetcher.Form>
          </div>
          <p className="text-xs text-harbour-400">
            Fetch the feed and preview items with current settings. Does not import anything.
          </p>

          {testResult && "error" in testResult && (
            <div className="p-3 bg-red-50 border border-red-200 text-sm text-red-700">
              {testResult.error}
            </div>
          )}

          {testResult && "success" in testResult && testResult.items && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-green-700">
                Found {testResult.totalCount} items in feed
              </p>
              {(testResult.items as { title: string; url: string; excerpt: string | null; publishedAt: string | null; matched: boolean }[]).map(
                (item, i) => (
                  <div
                    key={i}
                    className={`p-2 border border-harbour-100 text-sm ${!item.matched ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-harbour-700 hover:text-harbour-500 truncate"
                      >
                        {item.title}
                      </a>
                      {!item.matched && (
                        <span className="text-xs px-1 py-0.5 bg-harbour-100 text-harbour-400 shrink-0">
                          filtered
                        </span>
                      )}
                    </div>
                    {item.excerpt && (
                      <p className="text-xs text-harbour-400 line-clamp-1 mt-0.5">{item.excerpt}</p>
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Pending", count: source.counts.pending, color: "text-amber-700" },
            { label: "Published", count: source.counts.published, color: "text-green-700" },
            { label: "Hidden", count: source.counts.hidden, color: "text-harbour-500" },
            { label: "Drafts", count: source.counts.drafts, color: "text-blue-700" },
            { label: "Total", count: source.counts.total, color: "text-harbour-700" },
          ].map((stat) => (
            <div key={stat.label} className="p-3 bg-white border border-harbour-200 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
              <p className="text-xs text-harbour-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Pending Review */}
        {source.items.pending.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-harbour-700">
              Pending Review ({source.counts.pending})
            </h2>
            <div className="flex flex-col gap-1">
              {source.items.pending.map((item) => (
                <NewsItemRow
                  key={item.id}
                  item={item}
                  actions={[
                    {
                      label: "Approve",
                      value: "approve",
                      className: "text-green-700 hover:bg-green-50 border-green-200 hover:border-green-300",
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
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-harbour-700">
              Published ({source.counts.published})
            </h2>
            <div className="flex flex-col gap-1">
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
          <details className="flex flex-col gap-2">
            <summary className="text-lg font-semibold text-harbour-700 cursor-pointer">
              Hidden ({source.counts.hidden})
            </summary>
            <div className="flex flex-col gap-1 mt-2">
              {source.items.hidden.map((item) => (
                <NewsItemRow
                  key={item.id}
                  item={item}
                  actions={[
                    {
                      label: "Unhide",
                      value: "unhide",
                      className: "text-harbour-600 hover:bg-harbour-50 border-harbour-200 hover:border-harbour-300",
                    },
                  ]}
                />
              ))}
            </div>
          </details>
        )}

        {/* Empty state */}
        {source.counts.total === 0 && (
          <div className="p-8 bg-harbour-50 border border-harbour-200 text-centre">
            <p className="text-harbour-500 text-center">
              No news items imported yet. Click &quot;Sync Now&quot; to fetch from this source.
            </p>
          </div>
        )}

        {/* Danger Zone */}
        <details className="border border-harbour-200 bg-white">
          <summary className="p-4 text-sm font-medium text-red-700 cursor-pointer">
            Danger Zone
          </summary>
          <div className="p-4 pt-0">
            <fetcher.Form
              method="post"
              onSubmit={(e) => {
                if (!confirm(`Delete source "${source.name}" and all its ${source.counts.total} imported items?`)) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="delete-source" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
