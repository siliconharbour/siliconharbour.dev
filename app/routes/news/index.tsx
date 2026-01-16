import type { Route } from "./+types/index";
import { useLoaderData, Form } from "react-router";
import { getPaginatedNews } from "~/lib/news.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "News - siliconharbour.dev" },
    { name: "description", content: "News and announcements from the St. John's tech community" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  const { items: articles, total } = await getPaginatedNews(limit, offset, searchQuery);
  
  return { articles, total, limit, offset, searchQuery };
}

export default function NewsIndex() {
  const { articles, total, limit, offset, searchQuery } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">News</h1>
            <p className="text-harbour-500">Announcements and articles from the community</p>
          </div>
          
          {/* Search */}
          <Form method="get" className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search news..."
              className="flex-1 px-3 py-2 text-sm border border-harbour-200 focus:border-harbour-400 focus:outline-none text-harbour-700"
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
            >
              Search
            </button>
            {searchQuery && (
              <a
                href="/news"
                className="px-4 py-2 text-sm text-harbour-600 border border-harbour-200 hover:border-harbour-300 no-underline"
              >
                Clear
              </a>
            )}
          </Form>
          
          {/* Result count */}
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>

        {articles.length === 0 ? (
          <p className="text-harbour-400">
            {searchQuery ? "No news articles match your search." : "No news articles yet."}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {articles.map((article) => (
              <a
                key={article.id}
                href={`/news/${article.slug}`}
                className="group flex flex-col md:flex-row gap-4 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all no-underline"
              >
                {article.coverImage && (
                  <div className="img-tint w-full md:w-48 h-32 relative overflow-hidden bg-harbour-100 flex-shrink-0">
                    <img
                      src={`/images/${article.coverImage}`}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <h2 className="font-semibold text-harbour-700 group-hover:text-harbour-600">
                    {article.title}
                  </h2>
                  {article.publishedAt && (
                    <p className="text-sm text-harbour-400">
                      {format(article.publishedAt, "MMMM d, yyyy")}
                    </p>
                  )}
                  {article.excerpt && (
                    <p className="text-harbour-500 text-sm line-clamp-2">{article.excerpt}</p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
        
        <Pagination total={total} limit={limit} offset={offset} />
      </div>
    </div>
  );
}
