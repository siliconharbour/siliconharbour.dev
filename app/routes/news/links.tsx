import type { Route } from "./+types/links";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Links - News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadNewsListingData(request, "link");
}

export default function NewsLinks() {
  const data = useLoaderData<typeof loader>();

  return (
    <NewsListing
      data={data}
      searchPlaceholder="Search links..."
      emptyNoSearch="No link posts yet."
      emptyWithSearch="No links match your search."
      headlineMode={false}
      showTypeBadge={false}
    />
  );
}
