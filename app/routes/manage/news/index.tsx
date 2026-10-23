import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/index";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getAllNews } from "~/lib/news.server";
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
  await requireAdmin(request);
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
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get("intent") !== "submit-url") return { error: "Unknown intent" };
  const result = await runAdminOperation(request, operationCatalog.newsLinkSubmit, {
    url: form.get("url"),
    confirm: true,
  });
  return result.ok ? { success: true } : { error: result.error };
}

const typeLabels: Record<NewsType, string> = {
  link: "Link",
  article: "Article",
};

const statusColors: Record<NewsStatus, string> = {
  draft: "bg-tint text-body",
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
        <div className="flex items-center gap-gap-2">
          <Link
            to="/manage/import/news"
            className="px-pad-4 py-pad-2 bg-tint hover:bg-harbour-200 text-heading font-medium transition-colors"
          >
            Import Sources
          </Link>
          <Link
            to="/manage/news/new"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            New Article
          </Link>
        </div>
      }
    >
      {/* Submit URL quick-add */}
      <div className="border border-line bg-surface p-pad-4 rounded-panel">
        <fetcher.Form method="post" className="flex items-end gap-gap-3">
          <input type="hidden" name="intent" value="submit-url" />
          <div className="flex-1">
            <label htmlFor="submit-url" className="block text-sm font-medium text-heading mb-1">
              Quick Submit URL
            </label>
            <input
              type="url"
              id="submit-url"
              name="url"
              placeholder="https://example.com/article"
              required
              className="w-full px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-pad-4 py-pad-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
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
              <div className="flex-1 min-w-0 flex flex-col gap-gap-0-5">
                <div className="flex items-center gap-gap-2">
                  <h2 className="font-medium truncate text-heading">{article.title}</h2>
                  <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-body">
                    {typeLabels[article.type as NewsType] || article.type}
                  </span>
                  <span
                    className={`text-xs px-pad-1-5 py-pad-0-5 ${statusColors[article.status as NewsStatus] || "bg-tint text-body"}`}
                  >
                    {statusLabels[article.status as NewsStatus] || article.status}
                  </span>
                </div>
                <div className="flex items-center gap-gap-2 text-sm text-subtle">
                  {article.publishedAt && <span>{format(article.publishedAt, "MMM d, yyyy")}</span>}
                  {article.sourceName && <span>via {article.sourceName}</span>}
                </div>
              </div>

              <ManageListActions>
                <Link
                  to={`/manage/news/${article.id}`}
                  className="px-pad-3 py-pad-1-5 text-sm font-medium text-body hover:bg-soft transition-colors"
                >
                  Edit
                </Link>
                <Link
                  to={`/manage/news/${article.id}/delete`}
                  className="px-pad-3 py-pad-1-5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
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
