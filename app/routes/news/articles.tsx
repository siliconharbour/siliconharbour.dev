import type { Route } from "./+types/articles";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Articles - News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadNewsListingData(request, "article");
}

export default function NewsArticles() {
  const data = useLoaderData<typeof loader>();

  return (
    <NewsListing
      data={data}
      searchPlaceholder="Search articles..."
      emptyNoSearch="No articles yet."
      emptyWithSearch="No articles match your search."
      headlineMode
      showTypeBadge={false}
    />
  );
}
