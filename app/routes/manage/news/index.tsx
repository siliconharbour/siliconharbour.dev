import type { Route } from "./+types/index";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllNews, createNews } from "~/lib/news.server";
import { SearchInput } from "~/components/SearchInput";
import { format } from "date-fns";
import { ManagePage } from "~/components/manage/ManagePage";
import {
  ManageList,
  ManageListActions,
  ManageListEmpty,
  ManageListItem,
} from "~/components/manage/ManageList";
import type { NewsStatus, NewsType } from "~/db/schema";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const articles = await getAllNews();
  // Client-side filter for search
  const filtered = searchQuery
    ? articles.filter(
        (a) =>
          a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.excerpt?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : articles;
  return { articles: filtered, searchQuery };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "submit-url") {
    const rawUrl = (formData.get("url") as string)?.trim();
    if (!rawUrl) {
      return { error: "URL is required" };
    }

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return { error: "Invalid URL" };
    }

    // Fetch the URL to extract title + meta description
    let title = url.hostname;
    let excerpt: string | null = null;
    try {
      const resp = await fetch(rawUrl, {
        headers: { "User-Agent": "SiliconHarbourBot/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
      const html = await resp.text();

      // Extract <title>
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      // Extract meta description
      const descMatch = html.match(
        /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
      );
      if (!descMatch) {
        const descMatch2 = html.match(
          /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i,
        );
        if (descMatch2) excerpt = descMatch2[1].trim();
      } else {
        excerpt = descMatch[1].trim();
      }
    } catch {
      // If fetch fails, just use the domain as title
    }

    const sourceName = url.hostname.replace(/^www\./, "");

    await createNews({
      type: "link",
      status: "published",
      title,
      externalUrl: rawUrl,
      sourceName,
      content: excerpt || "",
      excerpt,
      publishedAt: new Date(),
    });

    return { success: true };
  }

  return { error: "Unknown action" };
}

const typeLabels: Record<NewsType, string> = {
  link: "Link",
  article: "Article",
};

const statusColors: Record<NewsStatus, string> = {
  draft: "bg-harbour-100 text-harbour-600",
  pending_review: "bg-amber-100 text-amber-700",
  published: "bg-green-100 text-green-700",
  hidden: "bg-red-100 text-red-700",
};

const statusLabels: Record<NewsStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  published: "Published",
  hidden: "Hidden",
};

export default function ManageNewsIndex() {
  const { articles } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const isSubmitting = fetcher.state !== "idle";
  const submitResult = fetcher.data;

  return (
    <ManagePage
      title="News"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/manage/import/news"
            className="px-4 py-2 bg-harbour-100 hover:bg-harbour-200 text-harbour-700 font-medium transition-colors"
          >
            Import Sources
          </Link>
          <Link
            to="/manage/news/new"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            New Article
          </Link>
        </div>
      }
    >
      {/* Submit URL quick-add */}
      <div className="border border-harbour-200 bg-white p-4">
        <fetcher.Form method="post" className="flex items-end gap-3">
          <input type="hidden" name="intent" value="submit-url" />
          <div className="flex-1">
            <label htmlFor="submit-url" className="block text-sm font-medium text-harbour-700 mb-1">
              Quick Submit URL
            </label>
            <input
              type="url"
              id="submit-url"
              name="url"
              placeholder="https://example.com/article"
              required
              className="w-full px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {isSubmitting ? "Submitting..." : "Submit Link"}
          </button>
        </fetcher.Form>
        {submitResult && "error" in submitResult && (
          <p className="mt-2 text-sm text-red-600">{submitResult.error}</p>
        )}
        {submitResult && "success" in submitResult && (
          <p className="mt-2 text-sm text-green-600">Link submitted and published.</p>
        )}
      </div>

      <SearchInput placeholder="Search news..." />

      {articles.length === 0 ? (
        <ManageListEmpty>
          No news items yet. Create your first article or submit a link to get started.
        </ManageListEmpty>
      ) : (
        <ManageList>
          {articles.map((article) => (
            <ManageListItem key={article.id}>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium truncate text-harbour-700">{article.title}</h2>
                  <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">
                    {typeLabels[article.type as NewsType] || article.type}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 ${statusColors[article.status as NewsStatus] || "bg-harbour-100 text-harbour-600"}`}
                  >
                    {statusLabels[article.status as NewsStatus] || article.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-harbour-400">
                  {article.publishedAt && (
                    <span>{format(article.publishedAt, "MMM d, yyyy")}</span>
                  )}
                  {article.sourceName && <span>via {article.sourceName}</span>}
                </div>
              </div>

              <ManageListActions>
                <Link
                  to={`/manage/news/${article.id}`}
                  className="px-3 py-1.5 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors"
                >
                  Edit
                </Link>
                <Link
                  to={`/manage/news/${article.id}/delete`}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete
                </Link>
              </ManageListActions>
            </ManageListItem>
          ))}
        </ManageList>
      )}
    </ManagePage>
  );
}
