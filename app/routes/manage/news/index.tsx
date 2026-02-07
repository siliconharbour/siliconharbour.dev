import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getPaginatedNews } from "~/lib/news.server";
import { SearchInput } from "~/components/SearchInput";
import { format } from "date-fns";
import { ManagePage } from "~/components/manage/ManagePage";
import { ManageList, ManageListActions, ManageListEmpty, ManageListItem } from "~/components/manage/ManageList";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const { items: articles } = await getPaginatedNews(100, 0, searchQuery);
  return { articles, searchQuery };
}

export default function ManageNewsIndex() {
  const { articles } = useLoaderData<typeof loader>();

  return (
    <ManagePage
      title="News"
      actions={
        <Link
          to="/manage/news/new"
          className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
        >
          New Article
        </Link>
      }
    >
      <SearchInput placeholder="Search articles..." />

      {articles.length === 0 ? (
        <ManageListEmpty>No news articles yet. Create your first article to get started.</ManageListEmpty>
      ) : (
        <ManageList>
          {articles.map((article) => (
            <ManageListItem key={article.id}>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium truncate text-harbour-700">{article.title}</h2>
                  {!article.publishedAt && (
                    <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-600">Draft</span>
                  )}
                </div>
                {article.publishedAt && (
                  <p className="text-sm text-harbour-400">{format(article.publishedAt, "MMM d, yyyy")}</p>
                )}
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
