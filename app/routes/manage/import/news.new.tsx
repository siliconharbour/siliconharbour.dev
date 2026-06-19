import type { Route } from "./+types/news.new";
import { Form, Link, useActionData, useNavigation } from "react-router";
import { redirect } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/session.server";
import { createNewsImportSource } from "~/lib/news-importers/sync.server";
import {
  newsSourceTypes,
  sourceTypeLabels,
  excerptModes,
  excerptModeLabels,
} from "~/lib/news-importers/types";
import type { NewsSourceType, ExcerptMode } from "~/lib/news-importers/types";
import { parseRssItems } from "~/lib/news-importers/rss.server";
import { ManagePage } from "~/components/manage/ManagePage";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Add News Import Source - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return null;
}

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sourceType: z.enum(newsSourceTypes),
  sourceUrl: z.string().trim().min(1, "Source URL is required").url("Must be a valid URL"),
  sourceIdentifier: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
  keywords: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
  useGlobalKeywords: z.preprocess((v) => v === "on", z.boolean()),
  useCompanyNameFilter: z.preprocess((v) => v === "on", z.boolean()),
  excerptMode: z.enum(excerptModes),
  entityUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().nullable(),
  ),
  enabled: z.preprocess((v) => v === "on", z.boolean()),
});

function matchesKeywords(
  title: string,
  excerpt: string | undefined,
  keywords: string,
): boolean {
  const keywordList = keywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (keywordList.length === 0) return true;
  const searchText = `${title} ${excerpt || ""}`.toLowerCase();
  return keywordList.some((keyword) => searchText.includes(keyword));
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "test-feed") {
    const sourceUrl = (formData.get("sourceUrl") as string)?.trim();
    const keywords = (formData.get("keywords") as string)?.trim() || null;
    const excerptMode = (formData.get("excerptMode") as ExcerptMode) || "description";

    if (!sourceUrl) {
      return { intent: "test-feed", error: "Source URL is required" };
    }

    try {
      const response = await fetch(sourceUrl, {
        headers: {
          "User-Agent": "siliconharbour.dev news aggregator",
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
      });

      if (!response.ok) {
        return {
          intent: "test-feed",
          error: `Feed returned ${response.status} ${response.statusText}`,
        };
      }

      const xml = await response.text();
      const allItems = parseRssItems(xml, excerptMode);

      const items = allItems.map((item) => ({
        title: item.title,
        url: item.url,
        excerpt: item.excerpt?.slice(0, 200) || null,
        publishedAt: item.publishedAt?.toISOString() || null,
        matched: keywords ? matchesKeywords(item.title, item.excerpt, keywords) : true,
      }));

      const matchedCount = items.filter((i) => i.matched).length;

      return {
        intent: "test-feed",
        success: true,
        items,
        totalCount: allItems.length,
        matchedCount,
        filteredCount: allItems.length - matchedCount,
      };
    } catch (e) {
      return {
        intent: "test-feed",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Default: create source
  const values: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    values[key] = value;
  }
  if (!formData.has("enabled")) {
    values.enabled = "" as FormDataEntryValue;
  }
  if (!formData.has("useGlobalKeywords")) {
    values.useGlobalKeywords = "" as FormDataEntryValue;
  }
  if (!formData.has("useCompanyNameFilter")) {
    values.useCompanyNameFilter = "" as FormDataEntryValue;
  }

  const parsed = formSchema.safeParse(values);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { error: firstIssue?.message ?? "Invalid form data" };
  }

  try {
    await createNewsImportSource({
      name: parsed.data.name,
      sourceType: parsed.data.sourceType as NewsSourceType,
      sourceUrl: parsed.data.sourceUrl,
      sourceIdentifier: parsed.data.sourceIdentifier,
      keywords: parsed.data.keywords,
      useGlobalKeywords: parsed.data.useGlobalKeywords,
      useCompanyNameFilter: parsed.data.useCompanyNameFilter,
      excerptMode: parsed.data.excerptMode,
      entityUrl: parsed.data.entityUrl,
      enabled: parsed.data.enabled,
    });

    return redirect("/manage/import/news");
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export default function NewNewsImportSource() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const activeIntent = navigation.formData?.get("intent");
  const isTesting = isSubmitting && activeIntent === "test-feed";
  const isCreating = isSubmitting && activeIntent !== "test-feed";

  const testResult =
    actionData && "intent" in actionData && actionData.intent === "test-feed"
      ? actionData
      : null;

  return (
    <ManagePage
      title="Add News Import Source"
      backTo="/manage/import/news"
      backLabel="Back to Import News"
    >
      {actionData && "error" in actionData && !("intent" in actionData) && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700">{actionData.error}</div>
      )}

      <Form method="post" className="bg-white border border-harbour-200 p-6 flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-harbour-700 mb-1">
            Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            required
            placeholder="e.g. TechNL Blog"
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          />
        </div>

        <div>
          <label htmlFor="sourceType" className="block text-sm font-medium text-harbour-700 mb-1">
            Source Type *
          </label>
          <select
            id="sourceType"
            name="sourceType"
            required
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          >
            {newsSourceTypes.map((type) => (
              <option key={type} value={type}>
                {sourceTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="sourceUrl" className="block text-sm font-medium text-harbour-700 mb-1">
            Source URL *
          </label>
          <input
            type="url"
            id="sourceUrl"
            name="sourceUrl"
            required
            placeholder="https://example.com/feed/"
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-harbour-400">
            RSS feed URL or page URL for custom scrapers.
          </p>
        </div>

        <div>
          <label
            htmlFor="sourceIdentifier"
            className="block text-sm font-medium text-harbour-700 mb-1"
          >
            Source Identifier (optional)
          </label>
          <input
            type="text"
            id="sourceIdentifier"
            name="sourceIdentifier"
            placeholder="scraperName or scraperName:config"
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-harbour-400">
            For custom scrapers: the scraper name or scraper name with config.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="keywords" className="block text-sm font-medium text-harbour-700">
              Keywords (optional)
            </label>
            <div className="flex items-center gap-4 text-xs text-harbour-500">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name="useGlobalKeywords"
                  className="w-3 h-3"
                />
                Use global keywords
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name="useCompanyNameFilter"
                  className="w-3 h-3"
                />
                Use company name filter
              </label>
            </div>
          </div>
          <input
            type="text"
            id="keywords"
            name="keywords"
            placeholder="tech, startup, innovation, AI"
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-harbour-400">
            Comma-separated keywords for filtering. Leave empty to import all items.
            Global keywords are configured in Settings. Company name filter uses names of
            companies flagged &quot;include in news filter&quot;.
          </p>
        </div>

        <div>
          <label htmlFor="excerptMode" className="block text-sm font-medium text-harbour-700 mb-1">
            Excerpt Mode
          </label>
          <select
            id="excerptMode"
            name="excerptMode"
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          >
            {excerptModes.map((mode) => (
              <option key={mode} value={mode}>
                {excerptModeLabels[mode]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-harbour-400">
            Where to pull the excerpt from. WordPress feeds often have junk in description — try
            &quot;Use content:encoded&quot; instead. Use &quot;Test Feed&quot; to preview.
          </p>
        </div>

        <div>
          <label htmlFor="entityUrl" className="block text-sm font-medium text-harbour-700 mb-1">
            Entity Page (optional)
          </label>
          <input
            type="text"
            id="entityUrl"
            name="entityUrl"
            placeholder="/directory/companies/technl"
            className="w-full px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:border-harbour-500"
          />
          <p className="mt-1 text-xs text-harbour-400">
            Path to the entity page in the directory. Source name will link here in listings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enabled"
            name="enabled"
            defaultChecked
            className="w-4 h-4"
          />
          <label htmlFor="enabled" className="text-sm text-harbour-700">
            Enabled (include in sync operations)
          </label>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t border-harbour-100">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {isCreating ? "Creating..." : "Add Source"}
          </button>
          <button
            type="submit"
            name="intent"
            value="test-feed"
            disabled={isSubmitting}
            className="px-4 py-2 border border-harbour-200 hover:border-harbour-400 text-harbour-600 hover:text-harbour-700 disabled:text-harbour-300 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {isTesting ? "Testing..." : "Test Feed"}
          </button>
          <Link
            to="/manage/import/news"
            className="px-4 py-2 text-harbour-500 hover:text-harbour-700"
          >
            Cancel
          </Link>
        </div>
      </Form>

      {/* Test feed results */}
      {testResult && (
        <div className="flex flex-col gap-3">
          {testResult.error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700">
              Feed test failed: {testResult.error}
            </div>
          )}

          {testResult.success && testResult.items && (
            <>
              <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm">
                Found {testResult.totalCount} items
                {testResult.filteredCount > 0 && (
                  <span>
                    {" "}
                    ({testResult.matchedCount} matched keywords, {testResult.filteredCount}{" "}
                    filtered)
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
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
                      className={`p-3 border border-harbour-200 bg-white ${!item.matched ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
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
                              <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-400 shrink-0">
                                filtered
                              </span>
                            )}
                          </div>
                          {item.excerpt && (
                            <p className="text-sm text-harbour-500 mt-1 line-clamp-2">
                              {item.excerpt}
                            </p>
                          )}
                          {item.publishedAt && (
                            <p className="text-xs text-harbour-400 mt-1">
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
