import { DOMParser } from "linkedom";
import type { FetchedJob } from "../types";
import { fetchPage, htmlToText } from "./utils";

const JOB_FEED_URL =
  "https://career2.successfactors.eu/career?company=akersoluti&career_ns=job_listing_summary&resultType=XML";
const APPLICATION_URL = "https://career2.successfactors.eu/sfcareer/jobreqcareer";
const ST_JOHNS = /\bSt\.?\s*John['’]?s\b/i;

export function parseAkerSolutionsFeed(xml: string): FetchedJob[] {
  const document = new DOMParser().parseFromString(xml, "text/xml");
  if (document.documentElement.tagName !== "Job-Listing") {
    throw new Error("Aker Solutions job feed returned an unexpected format");
  }

  const listings = [...document.querySelectorAll("Job")];
  if (listings.length === 0) {
    throw new Error("Aker Solutions job feed contained no jobs");
  }

  const jobs = new Map<string, FetchedJob>();
  for (const listing of listings) {
    if (listing.querySelector("filter7 > value")?.textContent?.trim() !== "Canada") continue;

    const descriptionHtml = listing.querySelector("Job-Description")?.textContent ?? "";
    if (!ST_JOHNS.test(htmlToText(descriptionHtml))) continue;

    const id = listing.querySelector("ReqId")?.textContent?.trim() ?? "";
    const title = htmlToText(listing.querySelector("JobTitle")?.textContent ?? "").trim();
    if (!/^\d+$/.test(id) || !title || jobs.has(id)) continue;

    const url = new URL(APPLICATION_URL);
    url.searchParams.set("jobId", id);
    url.searchParams.set("company", "akersoluti");
    jobs.set(id, {
      externalId: `jobpost-${id}`,
      title,
      location: "St. John's, Canada",
      url: url.toString(),
    });
  }

  return [...jobs.values()];
}

export async function scrapeAkerSolutions(): Promise<FetchedJob[]> {
  return parseAkerSolutionsFeed(await fetchPage(JOB_FEED_URL));
}
