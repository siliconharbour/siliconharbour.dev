import type { Route } from "./+types/updates";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Site Updates - News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadNewsListingData(request, "meta");
}

export default function NewsUpdates() {
  const data = useLoaderData<typeof loader>();

  return (
    <NewsListing
      data={data}
      searchPlaceholder="Search site updates..."
      emptyNoSearch="No site updates yet."
      emptyWithSearch="No site updates match your search."
      headlineMode={false}
      showTypeBadge={false}
    />
  );
}
