/**
 * C-CORE custom scraper
 *
 * WordPress site with WP REST API available. Job listings are child pages
 * of the careers page (parent ID 735). The API returns structured JSON with
 * title, URL, dates, and full HTML description.
 *
 * Descriptions contain WPBakery shortcodes that need stripping.
 */

import type { FetchedJob } from "../types";
import { fetchJson, htmlToText, stripShortcodes } from "./utils";

const API_URL = "https://c-core.ca/wp-json/wp/v2/pages";
const CAREERS_PARENT_ID = 735;

interface WPPage {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  link: string;
  date: string;
  modified: string;
}

export async function scrapeCCore(): Promise<FetchedJob[]> {
  const pages = await fetchJson<WPPage[]>(
    `${API_URL}?parent=${CAREERS_PARENT_ID}&per_page=100`
  );

  return pages.map((page) => {
    const descriptionHtml = stripShortcodes(page.content.rendered);

    return {
      externalId: String(page.id),
      title: htmlToText(page.title.rendered),
      location: "St. John's, NL",
      descriptionHtml: descriptionHtml || undefined,
      descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
      url: page.link,
      postedAt: new Date(page.date),
      updatedAt: new Date(page.modified),
    };
  });
}
