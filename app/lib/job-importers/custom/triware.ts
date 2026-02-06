/**
 * Triware Technologies custom scraper
 *
 * WordPress site using WP Job Manager plugin. The plugin registers a
 * `job-listings` (or `job_listing`) custom post type accessible via the
 * WP REST API. We try both endpoint variants since the slug can differ
 * between plugin versions.
 *
 * When no positions are posted the API returns an empty array.
 */

import type { FetchedJob } from "../types";
import { fetchJson, htmlToText } from "./utils";

const BASE_URL = "https://triware.ca/wp-json/wp/v2";

interface WPJobListing {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  link: string;
  date: string;
  modified: string;
}

async function fetchJobListings(): Promise<WPJobListing[]> {
  // Try the hyphenated endpoint first (most common for WP Job Manager)
  try {
    const listings = await fetchJson<WPJobListing[]>(
      `${BASE_URL}/job-listings?per_page=100`
    );
    return listings;
  } catch {
    // Fall through to try alternate endpoint
  }

  // Try the underscored endpoint variant
  try {
    const listings = await fetchJson<WPJobListing[]>(
      `${BASE_URL}/job_listing?per_page=100`
    );
    return listings;
  } catch {
    // Neither endpoint available — no jobs to return
    return [];
  }
}

export async function scrapeTriware(): Promise<FetchedJob[]> {
  const listings = await fetchJobListings();

  return listings.map((listing) => {
    const descriptionHtml = listing.content.rendered;

    return {
      externalId: String(listing.id),
      title: htmlToText(listing.title.rendered),
      location: "St. John's, NL",
      descriptionHtml: descriptionHtml || undefined,
      descriptionText: descriptionHtml
        ? htmlToText(descriptionHtml)
        : undefined,
      url: listing.link,
      postedAt: new Date(listing.date),
      updatedAt: new Date(listing.modified),
    };
  });
}
