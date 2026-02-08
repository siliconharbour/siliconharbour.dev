import type { Route } from "./+types/general";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "General - News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadNewsListingData(request, "general");
}

export default function NewsGeneral() {
  const data = useLoaderData<typeof loader>();

  return (
    <NewsListing
      data={data}
      searchPlaceholder="Search general news..."
      emptyNoSearch="No general news articles yet."
      emptyWithSearch="No general news articles match your search."
      headlineMode={false}
      showTypeBadge={false}
    />
  );
}
