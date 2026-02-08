import type { Route } from "./+types/editorial";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Editorial - News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadNewsListingData(request, "editorial");
}

export default function NewsEditorial() {
  const data = useLoaderData<typeof loader>();

  return (
    <NewsListing
      data={data}
      searchPlaceholder="Search editorial..."
      emptyNoSearch="No editorial articles yet."
      emptyWithSearch="No editorial articles match your search."
      headlineMode={false}
      showTypeBadge={false}
    />
  );
}
