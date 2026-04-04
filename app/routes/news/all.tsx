import type { Route } from "./+types/all";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";
import { buildSeoMeta } from "~/lib/seo";

export function meta({}: Route.MetaArgs) {
  return buildSeoMeta({
    title: "NL Tech News & Updates",
    description: "News, announcements, and updates from the tech scene in Newfoundland & Labrador.",
    url: "/news",
  });
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
