import { parseKeywords } from "~/lib/keywords";
import { newsSourceFormInput } from "~/lib/admin/content-form-adapters";
import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/news.new";
import { Form, Link, useActionData, useNavigation } from "react-router";
import { redirect } from "react-router";

import { requireAdmin } from "~/lib/session.server";

import {
  newsSourceTypes,
  sourceTypeLabels,
  excerptModes,
  excerptModeLabels,
} from "~/lib/news-importers/types";

import { ManagePage } from "~/components/manage/ManagePage";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Add News Import Source - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get("intent") === "test-feed") {
    const result = await runAdminOperation(request, operationCatalog.newsSourceTestFeed, {
      sourceUrl: form.get("sourceUrl"),
      keywords: parseKeywords(String(form.get("keywords") ?? "")),
      excerptMode: form.get("excerptMode") || "description",
      confirm: true,
    });
    return result.ok
      ? ({ intent: "test-feed" as const, success: true, ...result.data } as const)
      : ({ intent: "test-feed" as const, error: result.error } as const);
  }
  const result = await runAdminOperation(
    request,
    operationCatalog.newsSourceCreate,
    newsSourceFormInput(form, false),
  );
  return result.ok
    ? redirect(`/manage/import/news/${result.data.id}`)
    : ({ error: result.error } as const);
}

export default function NewNewsImportSource() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const activeIntent = navigation.formData?.get("intent");
  const isTesting = isSubmitting && activeIntent === "test-feed";
  const isCreating = isSubmitting && activeIntent !== "test-feed";

  const testResult =
    actionData && "intent" in actionData && actionData.intent === "test-feed" ? actionData : null;

  return (
    <ManagePage
      title="Add News Import Source"
      backTo="/manage/import/news"
      backLabel="Back to Import News"
    >
      {actionData && "error" in actionData && !("intent" in actionData) && (
        <div className="p-pad-4 bg-red-50 border border-red-200 text-red-700">
          {actionData.error}
        </div>
      )}

      <Form method="post" className="bg-surface border border-line p-pad-6 flex flex-col gap-gap-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-heading mb-1">
            Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            placeholder="e.g. TechNL Blog"
            className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:border-harbour-500"
          />
        </div>

        <div>
          <label htmlFor="sourceType" className="block text-sm font-medium text-heading mb-1">
            Source Type *
          </label>
          <select
            id="sourceType"
            name="sourceType"
            required
            className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:border-harbour-500"
          >
            {newsSourceTypes.map((type) => (
              <option key={type} value={type}>
                {sourceTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="sourceUrl" className="block text-sm font-medium text-heading mb-1">
            Source URL *
          </label>
          <input
            type="url"
            id="sourceUrl"
            name="sourceUrl"
            required
            placeholder="https://example.com/feed/"
            className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-subtle">RSS feed URL or page URL for custom scrapers.</p>
        </div>

        <div>
          <label htmlFor="sourceIdentifier" className="block text-sm font-medium text-heading mb-1">
            Source Identifier (optional)
          </label>
          <input
            type="text"
            id="sourceIdentifier"
            name="sourceIdentifier"
            placeholder="scraperName or scraperName:config"
            className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-subtle">
            For custom scrapers: the scraper name or scraper name with config.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="keywords" className="block text-sm font-medium text-heading">
              Keywords (optional)
            </label>
            <div className="flex items-center gap-gap-4 text-xs text-muted">
              <label className="flex items-center gap-gap-1-5">
                <input type="checkbox" name="useGlobalKeywords" className="w-3 h-3" />
                Use global keywords
              </label>
              <label className="flex items-center gap-gap-1-5">
                <input type="checkbox" name="useCompanyNameFilter" className="w-3 h-3" />
                Use company name filter
              </label>
            </div>
          </div>
          <input
            type="text"
            id="keywords"
            name="keywords"
            placeholder="tech, startup, innovation, AI"
            className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-subtle">
            Comma-separated keywords for filtering. Leave empty to import all items. Global keywords
            are configured in Settings. Company name filter uses names of companies flagged
            &quot;include in news filter&quot;.
          </p>
        </div>

        <div>
          <label htmlFor="excerptMode" className="block text-sm font-medium text-heading mb-1">
            Excerpt Mode
          </label>
          <select
            id="excerptMode"
            name="excerptMode"
            className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:border-harbour-500"
          >
            {excerptModes.map((mode) => (
              <option key={mode} value={mode}>
                {excerptModeLabels[mode]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-subtle">
            Where to pull the excerpt from. WordPress feeds often have junk in description — try
            &quot;Use content:encoded&quot; instead. Use &quot;Test Feed&quot; to preview.
          </p>
        </div>

        <div>
          <label htmlFor="entityUrl" className="block text-sm font-medium text-heading mb-1">
            Entity Page (optional)
          </label>
          <input
            type="text"
            id="entityUrl"
            name="entityUrl"
            placeholder="/directory/companies/technl"
            className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-subtle">
            Path to the entity page in the directory. Source name will link here in listings.
          </p>
        </div>

        <div className="flex items-center gap-gap-2">
          <input type="checkbox" id="enabled" name="enabled" defaultChecked className="w-4 h-4" />
          <label htmlFor="enabled" className="text-sm text-heading">
            Enabled (include in sync operations)
          </label>
        </div>

        <div className="flex items-center gap-gap-3 pt-pad-4 border-t border-harbour-100">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {isCreating ? "Creating..." : "Add Source"}
          </button>
          <button
            type="submit"
            name="intent"
            value="test-feed"
            disabled={isSubmitting}
            className="px-pad-4 py-pad-2 border border-line hover:border-harbour-400 text-body hover:text-heading disabled:text-harbour-300 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {isTesting ? "Testing..." : "Test Feed"}
          </button>
          <Link
            to="/manage/import/news"
            className="px-pad-4 py-pad-2 text-muted hover:text-heading"
          >
            Cancel
          </Link>
        </div>
      </Form>

      {/* Test feed results */}
      {testResult && (
        <div className="flex flex-col gap-gap-3">
          {testResult.error && (
            <div className="p-pad-4 bg-red-50 border border-red-200 text-red-700">
              Feed test failed: {testResult.error}
            </div>
          )}

          {"items" in testResult && (
            <>
              <div className="p-pad-3 bg-green-50 border border-green-200 text-green-700 text-sm">
                Found {testResult.totalCount} items
                {testResult.filteredCount > 0 && (
                  <span>
                    {" "}
                    ({testResult.matchedCount} matched keywords, {testResult.filteredCount}{" "}
                    filtered)
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-gap-1">
                {testResult.items.map(
                  (
                    item: {
                      title: string;
                      url: string;
                      excerpt: string | null;
                      publishedAt: string | null;
                      matched: boolean;
                    },
                    i: number,
                  ) => (
                    <div
                      key={i}
                      className={`p-pad-3 border border-line bg-surface ${!item.matched ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start gap-gap-2">
                        <div className="flex-1 min-w-0">
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
                              <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-subtle shrink-0">
                                filtered
                              </span>
                            )}
                          </div>
                          {item.excerpt && (
                            <p className="text-sm text-muted mt-1 line-clamp-2">{item.excerpt}</p>
                          )}
                          {item.publishedAt && (
                            <p className="text-xs text-subtle mt-1">
                              {new Date(item.publishedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </>
          )}
        </div>
      )}
    </ManagePage>
  );
}
