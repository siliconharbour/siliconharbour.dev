/**
 * Aker Solutions custom scraper
 *
 * Uses the filtered careers URL (Canada + St. John's) and extracts job postings
 * from embedded structured data and generic anchor/link fallbacks.
 */

import type { FetchedJob, WorkplaceType } from "../types";
import { fetchPage, htmlToText, slugify } from "./utils";

const DEFAULT_CAREERS_URL =
  "https://www.akersolutions.com/careers/job-search/?country=Canada&location=St.+John%27s";

const NON_JOB_TITLES = [
  "job search",
  "careers",
  "cookie",
  "privacy",
  "terms",
  "investor",
  "news",
];

type JobCandidate = {
  title: string;
  url?: string;
  location?: string;
  description?: string;
  postedAt?: Date;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isLikelyJobTitle(title: string): boolean {
  const trimmed = normalizeText(title);
  if (!trimmed || trimmed.length < 3 || trimmed.length > 140) return false;
  const lower = trimmed.toLowerCase();
  return !NON_JOB_TITLES.some((term) => lower === term || lower.includes(term));
}

function locationMatchesFilter(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("st. john") || lower.includes("st john");
}

function detectWorkplaceType(text: string): WorkplaceType | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("hybrid")) return "hybrid";
  if (lower.includes("remote")) return "remote";
  if (lower.includes("on-site") || lower.includes("onsite") || lower.includes("on site")) {
    return "onsite";
  }
  return undefined;
}

function safeDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function extractLocation(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return normalizeText(value);
  if (Array.isArray(value)) {
    return value.map((item) => extractLocation(item)).filter(Boolean).join(" | ");
  }
  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const direct = normalizeText(
    typeof record.addressLocality === "string"
      ? record.addressLocality
      : typeof record.location === "string"
        ? record.location
        : typeof record.name === "string"
          ? record.name
          : typeof record.text === "string"
            ? record.text
            : ""
  );
  if (direct) return direct;

  if (record.address && typeof record.address === "object") {
    const address = record.address as Record<string, unknown>;
    const parts = [
      normalizeText(typeof address.streetAddress === "string" ? address.streetAddress : ""),
      normalizeText(typeof address.addressLocality === "string" ? address.addressLocality : ""),
      normalizeText(typeof address.addressRegion === "string" ? address.addressRegion : ""),
      normalizeText(typeof address.addressCountry === "string" ? address.addressCountry : ""),
    ].filter(Boolean);
    return parts.join(", ");
  }

  return "";
}

function toAbsoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function parseJsonLdJobs(html: string, baseUrl: string): JobCandidate[] {
  const jobs: JobCandidate[] = [];
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }

    const queue: unknown[] = Array.isArray(data) ? [...data] : [data];
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current || typeof current !== "object") continue;

      const record = current as Record<string, unknown>;
      const type = typeof record["@type"] === "string" ? record["@type"].toLowerCase() : "";

      if (type === "jobposting") {
        const title = normalizeText(
          typeof record.title === "string"
            ? record.title
            : typeof record.name === "string"
              ? record.name
              : ""
        );
        if (!isLikelyJobTitle(title)) {
          continue;
        }

        const url = normalizeText(typeof record.url === "string" ? record.url : "");
        const location = extractLocation(record.jobLocation ?? record.applicantLocationRequirements);
        const description = normalizeText(
          typeof record.description === "string" ? htmlToText(record.description) : ""
        );
        jobs.push({
          title,
          url: url ? toAbsoluteUrl(url, baseUrl) : baseUrl,
          location,
          description,
          postedAt: safeDate(record.datePosted ?? record.validFrom),
        });
      }

      if (Array.isArray(record.itemListElement)) {
        queue.push(...record.itemListElement);
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === "object") {
          queue.push(value);
        }
      }
    }
  }

  return jobs;
}

function parseAnchorFallbackJobs(html: string, baseUrl: string): JobCandidate[] {
  const jobs: JobCandidate[] = [];
  const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = normalizeText(match[1]);
    if (!href) continue;

    const title = normalizeText(htmlToText(match[2]));
    if (!isLikelyJobTitle(title)) continue;

    const normalizedHref = href.toLowerCase();
    if (!normalizedHref.includes("job")) continue;

    const contextStart = Math.max(0, match.index - 350);
    const contextEnd = Math.min(html.length, match.index + match[0].length + 350);
    const context = htmlToText(html.slice(contextStart, contextEnd));

    jobs.push({
      title,
      url: toAbsoluteUrl(href, baseUrl),
      location: normalizeText(context),
      description: normalizeText(context),
    });
  }

  return jobs;
}

export async function scrapeAkerSolutions(careersUrl: string = DEFAULT_CAREERS_URL): Promise<FetchedJob[]> {
  const html = await fetchPage(careersUrl);

  const candidates = [...parseJsonLdJobs(html, careersUrl), ...parseAnchorFallbackJobs(html, careersUrl)];
  const jobsByExternalId = new Map<string, FetchedJob>();

  for (const candidate of candidates) {
    if (!isLikelyJobTitle(candidate.title)) continue;

    const locationText = normalizeText(candidate.location);
    const jobTextForFilter = `${candidate.title} ${locationText} ${candidate.description ?? ""}`;
    if (!locationMatchesFilter(jobTextForFilter)) {
      continue;
    }

    const url = candidate.url || careersUrl;
    const externalId = slugify(url !== careersUrl ? url : `${candidate.title}-${locationText || "st-johns"}`);
    if (!externalId) continue;

    jobsByExternalId.set(externalId, {
      externalId,
      title: candidate.title,
      location: locationText || "St. John's, NL",
      descriptionText: candidate.description || undefined,
      url,
      workplaceType: detectWorkplaceType(jobTextForFilter),
      postedAt: candidate.postedAt,
    });
  }

  return [...jobsByExternalId.values()];
}
