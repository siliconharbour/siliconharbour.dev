import type { Route } from "./+types/all";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadNewsListingData(request);
}

export default function NewsAll() {
  const data = useLoaderData<typeof loader>();

  return (
    <NewsListing
      data={data}
      searchPlaceholder="Search news..."
      emptyNoSearch="No news articles yet."
      emptyWithSearch="No news articles match your search."
      headlineMode
      showTypeBadge
    />
  );
}
