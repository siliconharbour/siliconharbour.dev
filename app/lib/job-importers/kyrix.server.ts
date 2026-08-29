/** Kyrix public job-board importer. */

import pLimit from "p-limit";
import { parseHTML } from "linkedom";
import type {
  FetchedJob,
  ImportSourceConfig,
  JobImporter,
  ValidationResult,
  WorkplaceType,
} from "./types";
import { htmlToText } from "./text.server";

const KYRIX_BASE_URL = "https://www.kyrix.ai";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function detectWorkplaceType(location: string): WorkplaceType | undefined {
  const normalized = location.toLowerCase();
  if (normalized.includes("hybrid")) return "hybrid";
  if (normalized.includes("remote")) return "remote";
  return location ? "onsite" : undefined;
}

function parsePostedAt(text: string): Date | undefined {
  const match = text.match(/Posted\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
  if (!match) return undefined;
  const date = new Date(`${match[1]} 00:00:00 UTC`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseKyrixListing(html: string, orgSlug: string): FetchedJob[] {
  const { document } = parseHTML(html);
  const jobs: FetchedJob[] = [];
  const seen = new Set<string>();
  const pathPattern = new RegExp(`^/j/${orgSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^/?#]+)$`);

  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href") ?? "";
    const id = href.match(pathPattern)?.[1];
    const title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!id || !title || seen.has(id)) continue;

    let card: Element | null = anchor;
    while (card?.parentElement && !card.className.toString().includes("bg-white")) {
      card = card.parentElement;
    }
    const cardText = (card?.textContent ?? "").replace(/\s+/g, " ").trim();
    const metadata = card?.querySelector("div.text-sm.text-gray-500");
    const metadataParts = Array.from(metadata?.querySelectorAll("span") ?? [])
      .map((span) => (span.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((value) => value && value !== "•");
    const location = metadataParts[1];

    seen.add(id);
    jobs.push({
      externalId: id,
      title,
      location: location || undefined,
      url: new URL(href, KYRIX_BASE_URL).toString(),
      workplaceType: detectWorkplaceType(location ?? ""),
      postedAt: parsePostedAt(cardText),
    });
  }

  return jobs;
}

export function parseKyrixDetail(html: string): Pick<FetchedJob, "descriptionHtml" | "descriptionText"> {
  const { document } = parseHTML(html);
  const content = document.querySelector("div.prose.prose-indigo.max-w-none");
  const descriptionHtml = content?.innerHTML.trim();
  return {
    descriptionHtml: descriptionHtml || undefined,
    descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
  };
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": BROWSER_USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`Kyrix fetch error: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchJobs(orgSlug: string): Promise<FetchedJob[]> {
  const listingUrl = `${KYRIX_BASE_URL}/j/embed/${encodeURIComponent(orgSlug)}?lang=en`;
  const jobs = parseKyrixListing(await fetchHtml(listingUrl), orgSlug);
  const limit = pLimit(5);
  return Promise.all(
    jobs.map((job) =>
      limit(async () => ({
        ...job,
        ...parseKyrixDetail(await fetchHtml(job.url)),
      })),
    ),
  );
}

export const kyrixImporter: JobImporter = {
  sourceType: "kyrix",
  meta: {
    name: "Kyrix",
    approach: "Parses Kyrix's public embedded job board and individual job pages.",
    style: "Server-rendered HTML parsing",
    reliability: "medium-high",
    quirks: "The source identifier is the organization slug from the embed URL.",
  },

  fetchJobs(config: ImportSourceConfig) {
    return fetchJobs(config.sourceIdentifier);
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    if (!config.sourceIdentifier.trim()) {
      return { valid: false, error: "Kyrix organization slug is required" };
    }
    try {
      const jobs = await fetchJobs(config.sourceIdentifier);
      return { valid: true, jobCount: jobs.length };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
