import type { Route } from "./+types/index";
import { useLoaderData } from "react-router";
import { getPublishedNews } from "~/lib/news.server";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "News - siliconharbour.dev" },
    { name: "description", content: "News and announcements from the St. John's tech community" },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const articles = await getPublishedNews();
  return { articles };
}

export default function NewsIndex() {
  const { articles } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-harbour-700">News</h1>
          <p className="text-harbour-500">Announcements and articles from the community</p>
        </div>

        {articles.length === 0 ? (
          <p className="text-harbour-400">No news articles yet.</p>
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
      </div>
    </div>
  );
}
