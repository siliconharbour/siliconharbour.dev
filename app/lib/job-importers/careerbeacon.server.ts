/**
 * CareerBeacon Job Importer
 *
 * Supports two input modes:
 * 1) One or more direct CareerBeacon job URLs (recommended)
 * 2) A company id/slug listing source (best-effort; may be blocked by Cloudflare)
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
  WorkplaceType,
} from "./types";
import { htmlToText } from "./text.server";

const CAREERBEACON_JOB_URL_RE =
  /https?:\/\/www\.careerbeacon\.com\/en\/job\/\d+\/[\w-]+\/[\w-]+\/[\w-]+/gi;

interface CareerBeaconPosting {
  externalId: string;
  title: string;
  descriptionHtml?: string;
  location?: string;
  employmentType?: string[];
  url: string;
  postedAt?: Date;
  workplaceType?: WorkplaceType;
}

function parseJobUrlsFromText(value: string): string[] {
  const matches = value.match(CAREERBEACON_JOB_URL_RE) ?? [];
  return Array.from(new Set(matches));
}

function getScriptJsonBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match[1]) blocks.push(match[1]);
  }
  return blocks;
}

function normalizeEmploymentType(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function toWorkplaceType(jobLocationType: unknown, location: string): WorkplaceType | undefined {
  const raw = `${String(jobLocationType || "")} ${location}`.toLowerCase();
  if (raw.includes("hybrid")) return "hybrid";
  if (raw.includes("remote") || raw.includes("telecommute")) return "remote";
  if (raw.includes("in-person") || raw.includes("in person") || raw.includes("on-site")) {
    return "onsite";
  }
  return undefined;
}

function parseLocation(jobPosting: Record<string, unknown>): string | undefined {
  const location = jobPosting.jobLocation;
  const entries = Array.isArray(location) ? location : location ? [location] : [];

  const formatted = entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const addr = (entry as { address?: Record<string, unknown> }).address;
      if (!addr || typeof addr !== "object") return "";
      const city = String(addr.addressLocality || "").trim();
      const region = String(addr.addressRegion || "").trim();
      const country = String(addr.addressCountry || "").trim();
      return [city, region, country].filter(Boolean).join(", ");
    })
    .filter(Boolean);

  return formatted.length > 0 ? formatted.join("; ") : undefined;
}

function parseCareerBeaconPostingFromHtml(html: string, fallbackUrl: string): CareerBeaconPosting {
  const blocks = getScriptJsonBlocks(html);

  for (const raw of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const item = candidate as Record<string, unknown>;
      if (item["@type"] !== "JobPosting") continue;

      const url = String(item.url || fallbackUrl);
      const externalIdFromSchema =
        item.identifier && typeof item.identifier === "object"
          ? String((item.identifier as Record<string, unknown>).value || "")
          : "";
      const externalIdFromUrl = url.match(/\/job\/(\d+)\//)?.[1] ?? "";
      const externalId = externalIdFromSchema || externalIdFromUrl;
      if (!externalId) {
        throw new Error("Could not determine CareerBeacon job id from JobPosting schema");
      }

      const title = String(item.title || "").trim();
      if (!title) throw new Error("CareerBeacon JobPosting schema missing title");

      const descriptionHtml = String(item.description || "").trim() || undefined;
      const location = parseLocation(item) ?? "";
      const workplaceType = toWorkplaceType(item.jobLocationType, location);
      const employmentType = normalizeEmploymentType(item.employmentType);
      const postedAt = item.datePosted ? new Date(String(item.datePosted)) : undefined;

      return {
        externalId,
        title,
        descriptionHtml,
        location: location || undefined,
        employmentType,
        url,
        postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
        workplaceType,
      };
    }
  }

  throw new Error("Could not find JobPosting schema on CareerBeacon page");
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "siliconharbour.dev job importer",
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        `CareerBeacon blocked access to ${url} (HTTP 403). Try using direct job URLs as sourceUrl/sourceIdentifier.`,
      );
    }
    throw new Error(`CareerBeacon fetch error: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function listingUrlFromIdentifier(sourceIdentifier: string): string {
  if (/^\d+$/.test(sourceIdentifier)) {
    return `https://www.careerbeacon.com/en/search?filter-company_id=${sourceIdentifier}`;
  }
  return `https://www.careerbeacon.com/en/employer/${encodeURIComponent(sourceIdentifier)}`;
}

function parseJobLinksFromListingHtml(html: string): string[] {
  const links = html.match(CAREERBEACON_JOB_URL_RE) ?? [];
  return Array.from(new Set(links));
}

async function resolveJobUrls(config: ImportSourceConfig): Promise<string[]> {
  const urlsFromSourceUrl = parseJobUrlsFromText(config.sourceUrl || "");
  if (urlsFromSourceUrl.length > 0) return urlsFromSourceUrl;

  const urlsFromIdentifier = parseJobUrlsFromText(config.sourceIdentifier || "");
  if (urlsFromIdentifier.length > 0) return urlsFromIdentifier;

  if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
    throw new Error(
      "CareerBeacon sourceIdentifier is required (job URL(s), employer slug, or company id)",
    );
  }

  const listingUrl = listingUrlFromIdentifier(config.sourceIdentifier.trim());
  const listingHtml = await fetchHtml(listingUrl);
  const urls = parseJobLinksFromListingHtml(listingHtml);
  if (urls.length === 0) {
    throw new Error(`No CareerBeacon job URLs found at listing page ${listingUrl}`);
  }

  return urls;
}

function convertPosting(posting: CareerBeaconPosting): FetchedJob {
  const department = posting.employmentType?.join(", ") || undefined;
  return {
    externalId: posting.externalId,
    title: posting.title,
    location: posting.location,
    department,
    descriptionHtml: posting.descriptionHtml,
    descriptionText: posting.descriptionHtml ? htmlToText(posting.descriptionHtml) : undefined,
    url: posting.url,
    workplaceType: posting.workplaceType,
    postedAt: posting.postedAt,
  };
}

export const careerbeaconImporter: JobImporter = {
  sourceType: "careerbeacon",

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const urls = await resolveJobUrls(config);
    const jobs: FetchedJob[] = [];

    for (const url of urls) {
      const html = await fetchHtml(url);
      const posting = parseCareerBeaconPostingFromHtml(html, url);
      jobs.push(convertPosting(posting));
    }

    return jobs;
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return {
        valid: false,
        error: "CareerBeacon requires sourceIdentifier (job URL(s), company id, or employer slug)",
      };
    }

    try {
      const jobs = await this.fetchJobs(config as ImportSourceConfig);
      return {
        valid: true,
        jobCount: jobs.length,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};

export const __testables = {
  parseJobUrlsFromText,
  parseCareerBeaconPostingFromHtml,
  parseJobLinksFromListingHtml,
};
