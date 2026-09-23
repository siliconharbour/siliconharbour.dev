import { parseHTML } from "linkedom";
import pLimit from "p-limit";
import { htmlToText } from "./text.server";
import type { FetchedJob, ImportSourceConfig, JobImporter } from "./types";

type Listing = Pick<FetchedJob, "externalId" | "title" | "location" | "url" | "workplaceType">;

function boardUrl(identifier: string): string {
  if (!/^[a-z0-9-]+$/.test(identifier)) {
    throw new Error("JazzHR source identifier must be an applytojob.com subdomain");
  }
  return `https://${identifier}.applytojob.com/apply`;
}

function isRelevantFonemedJob(job: Listing): boolean {
  const location = job.location ?? "";
  const inNewfoundland = /\bNL\b|Newfoundland|St\.? John'?s/i.test(location);
  const technicalTitle =
    /\b(software|developer|engineer|engineering|devops|data|product|digital|cybersecurity|programmer|systems|web|applications?|UX|QA)\b|\bIT\b/i.test(
      job.title,
    );
  return inNewfoundland && technicalTitle;
}

function selectListings(identifier: string, listings: Listing[]): Listing[] {
  return identifier === "fonemed" ? listings.filter(isRelevantFonemedJob) : listings;
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error(`JazzHR fetch failed (${response.status}): ${url}`);
  return response.text();
}

function parseListings(html: string, baseUrl: string): Listing[] {
  const { document } = parseHTML(html);
  const host = new URL(baseUrl).hostname;
  const listings: Listing[] = [];

  for (const row of document.querySelectorAll("li.list-group-item")) {
    const link = row.querySelector("h3.list-group-item-heading a[href]");
    const title = link?.textContent?.trim();
    if (!link || !title) continue;

    const url = new URL(link.getAttribute("href") ?? "", baseUrl);
    const id = url.pathname.match(/^\/apply\/([a-zA-Z0-9]+)\/[^/]+\/?$/)?.[1];
    if (url.hostname !== host || !id) continue;

    const location = row.querySelector(".list-group-item-text li")?.textContent?.trim();
    listings.push({
      externalId: id,
      title,
      location: location || undefined,
      url: url.toString(),
      workplaceType: location && /\bremote\b/i.test(location) ? "remote" : undefined,
    });
  }

  return listings;
}

export const jazzhrImporter: JobImporter = {
  sourceType: "jazzhr",
  meta: {
    name: "JazzHR",
    approach: "Parses public applytojob.com career listings and job detail pages.",
    style: "HTML listing and detail parsing",
    reliability: "medium",
    quirks: "Fonemed listings are limited to Newfoundland technology roles by title and location.",
  },

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const baseUrl = boardUrl(config.sourceIdentifier);
    const allListings = parseListings(await fetchPage(baseUrl), baseUrl);
    if (allListings.length === 0) throw new Error(`No JazzHR listings found at ${baseUrl}`);
    const listings = selectListings(config.sourceIdentifier, allListings);

    const limit = pLimit(5);
    return Promise.all(
      listings.map((listing) =>
        limit(async () => {
          const { document } = parseHTML(await fetchPage(listing.url));
          const descriptionHtml = document.querySelector("#job-description")?.innerHTML?.trim();
          if (!descriptionHtml) throw new Error(`JazzHR job description missing: ${listing.url}`);
          return { ...listing, descriptionHtml, descriptionText: htmlToText(descriptionHtml) };
        }),
      ),
    );
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">) {
    try {
      const baseUrl = boardUrl(config.sourceIdentifier);
      const allListings = parseListings(await fetchPage(baseUrl), baseUrl);
      if (allListings.length === 0) return { valid: false, error: "No jobs found on JazzHR board" };
      const listings = selectListings(config.sourceIdentifier, allListings);
      return { valid: true, jobCount: listings.length };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
