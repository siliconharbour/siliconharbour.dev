/**
 * TechNL job board aggregator
 *
 * TechNL (techNL.ca) runs a WordPress site with the WP Job Manager plugin.
 * Member companies post jobs there, and the plugin exposes a clean RSS feed
 * at https://technl.ca/?feed=job_feed that carries the full job description
 * plus structured metadata in a `job_listing:` namespace.
 *
 * This module fetches and parses that feed. It is NOT a job importer in the
 * `JobImporter` sense — TechNL aggregates jobs from many different companies,
 * so we surface the listings on a dedicated admin view (and via MCP) and let
 * a human decide whether to `createJob` for any postings that aren't already
 * covered by a direct company-level ATS source.
 */

import { DOMParser } from "linkedom";
import { db } from "~/db";
import { companies, jobs, jobImportSources } from "~/db/schema";
import { htmlToText } from "~/lib/job-importers/text.server";

const FEED_URL = "https://technl.ca/?feed=job_feed";

export interface TechNLJob {
  /** Canonical link to the technl.ca posting */
  link: string;
  /** Job title as posted on TechNL */
  title: string;
  /** Company name as posted on TechNL */
  company: string;
  /** Location string from the job_listing:location namespace */
  location: string | null;
  /** Job type — "Full Time", "Contract", etc. */
  jobType: string | null;
  /** Salary string when provided by the employer */
  salary: string | null;
  /** Full HTML description from content:encoded */
  descriptionHtml: string;
  /** Plain-text rendering of the description */
  descriptionText: string;
  /** RFC 2822 pubDate as ISO string */
  postedAt: string | null;
}

export interface TechNLJobWithMatch extends TechNLJob {
  /** Matched SiliconHarbour company, if any */
  match: {
    companyId: number | null;
    companySlug: string | null;
    companyVisible: boolean | null;
    /** True if a job with this exact URL already exists in our DB. */
    alreadyImported: boolean;
    /** ID of the matching job row, if alreadyImported. */
    matchedJobId: number | null;
    matchedJobStatus: string | null;
    /** True if the matched company has a job_import_sources row of any type. */
    companyHasJobSource: boolean;
  };
}

/**
 * Fetch the TechNL job feed and parse it into structured entries.
 */
export async function fetchTechNLJobs(): Promise<TechNLJob[]> {
  const response = await fetch(FEED_URL, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!response.ok) {
    throw new Error(`TechNL feed fetch failed: ${response.status} ${response.statusText}`);
  }
  const xml = await response.text();
  return parseTechNLFeed(xml);
}

/**
 * Parse the raw RSS XML into TechNLJob entries. Exported separately for tests.
 */
export function parseTechNLFeed(xml: string): TechNLJob[] {
  const document = new DOMParser().parseFromString(xml, "text/xml");
  const items = Array.from(document.querySelectorAll("item"));
  const jobs: TechNLJob[] = [];

  for (const item of items) {
    const title = textOf(item, "title");
    const link = textOf(item, "link");
    if (!title || !link) continue;

    const descriptionHtml =
      textOf(item, "content\\:encoded") || textOf(item, "description") || "";

    jobs.push({
      link,
      title: decodeEntities(title),
      company: decodeEntities(textOf(item, "job_listing\\:company") || ""),
      location: nullable(decodeEntities(textOf(item, "job_listing\\:location") || "")),
      jobType: nullable(decodeEntities(textOf(item, "job_listing\\:job_type") || "")),
      salary: nullable(decodeEntities(textOf(item, "job_listing\\:salary") || "")),
      descriptionHtml,
      descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : "",
      postedAt: rfc2822ToIso(textOf(item, "pubDate")),
    });
  }

  return jobs;
}

/**
 * Fetch the TechNL feed and annotate each entry with company / dedupe info
 * pulled from our database, so callers can see at a glance which postings
 * are already covered.
 */
export async function fetchTechNLJobsWithMatches(): Promise<{
  jobs: TechNLJobWithMatch[];
  fetchedAt: string;
}> {
  const fetched = await fetchTechNLJobs();
  if (fetched.length === 0) {
    return { jobs: [], fetchedAt: new Date().toISOString() };
  }

  // Resolve companies by case-insensitive name. WP Job Manager lets the
  // poster type the company name freely, so an exact match is unreliable —
  // we fold to lowercase and trim before comparing.
  const companyNames = Array.from(
    new Set(fetched.map((j) => j.company.trim()).filter(Boolean)),
  );

  const allCompanies = companyNames.length
    ? await db.select().from(companies)
    : [];
  const companyIndex = new Map<string, (typeof allCompanies)[number]>();
  for (const c of allCompanies) {
    companyIndex.set(c.name.trim().toLowerCase(), c);
  }

  // Look up jobs by URL to detect duplicates. We compare on the technl.ca
  // canonical link.
  const links = fetched.map((j) => j.link);
  const matchedJobs = links.length
    ? await db.select({ id: jobs.id, url: jobs.url, status: jobs.status, companyId: jobs.companyId }).from(jobs)
    : [];
  const jobByUrl = new Map<string, (typeof matchedJobs)[number]>();
  for (const j of matchedJobs) {
    if (j.url) jobByUrl.set(j.url, j);
  }

  // For company-level dedup signal, mark companies that already have any
  // job_import_sources row.
  const companyIdsWithSources = new Set<number>();
  if (allCompanies.length) {
    const rows = await db
      .select({ companyId: jobImportSources.companyId })
      .from(jobImportSources);
    for (const r of rows) companyIdsWithSources.add(r.companyId);
  }

  const annotated: TechNLJobWithMatch[] = fetched.map((j) => {
    const company = companyIndex.get(j.company.trim().toLowerCase());
    const matchedJob = jobByUrl.get(j.link);
    return {
      ...j,
      match: {
        companyId: company?.id ?? null,
        companySlug: company?.slug ?? null,
        companyVisible: company?.visible ?? null,
        alreadyImported: !!matchedJob,
        matchedJobId: matchedJob?.id ?? null,
        matchedJobStatus: matchedJob?.status ?? null,
        companyHasJobSource: company ? companyIdsWithSources.has(company.id) : false,
      },
    };
  });

  return { jobs: annotated, fetchedAt: new Date().toISOString() };
}

// ── helpers ───────────────────────────────────────────────────────────

function textOf(item: Element, selector: string): string {
  // querySelector with `:` escaped works for namespaced tags in linkedom.
  const node = item.querySelector(selector);
  return (node?.textContent ?? "").trim();
}

function nullable(value: string): string | null {
  return value.length > 0 ? value : null;
}

function rfc2822ToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Decode the few HTML entities that show up in WordPress's RSS feeds in
 * places that won't be passed through `htmlToText` (titles, locations, etc.).
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?38;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}
