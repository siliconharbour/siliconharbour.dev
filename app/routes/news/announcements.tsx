import type { Route } from "./+types/announcements";
import { useLoaderData } from "react-router";
import { NewsListing } from "~/components/news/NewsListing";
import { loadNewsListingData } from "~/lib/news-listing.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Announcements - News - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadNewsListingData(request, "announcement");
}

export default function NewsAnnouncements() {
  const data = useLoaderData<typeof loader>();

  return (
    <NewsListing
      data={data}
      searchPlaceholder="Search announcements..."
      emptyNoSearch="No announcements yet."
      emptyWithSearch="No announcements match your search."
      headlineMode
      showTypeBadge={false}
    />
  );
}
