/**
 * Job search aggregators for Indeed and LinkedIn.
 *
 * These are NOT import sources — they're search tools that return jobs
 * from location-based queries. Results need human/AI review before
 * being added via createJob().
 *
 * Used by the MCP execute tool for agent-assisted job discovery.
 *
 * Approach derived from JobSpy (MIT): https://github.com/speedyapply/JobSpy
 * If these scrapers break, check JobSpy for updated API keys, endpoints,
 * headers, or workarounds:
 *   Indeed:   https://github.com/speedyapply/JobSpy/blob/main/jobspy/indeed/
 *   LinkedIn: https://github.com/speedyapply/JobSpy/blob/main/jobspy/linkedin/
 */

import { htmlToText } from "./job-importers/text.server";

// ── Indeed (GraphQL API) ─────────────────────────────────────────────

const INDEED_API = "https://apis.indeed.com/graphql";
const INDEED_HEADERS = {
  Host: "apis.indeed.com",
  "content-type": "application/json",
  "indeed-api-key":
    "161092c2017b5bbab13edb12461a62d5a833871e7cad6d9d475304573de67ac8",
  accept: "application/json",
  "indeed-locale": "en-CA",
  "indeed-co": "CA",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Indeed App 193.1",
  "indeed-app-info":
    "appv=193.1; appid=com.indeed.jobsearch; osv=16.6.1; os=ios; dtype=phone",
};

const INDEED_QUERY = `
  query GetJobData {
    jobSearch(
      {what}
      {location}
      limit: {limit}
      sort: DATE
      {cursor}
      {filters}
    ) {
      pageInfo { nextCursor }
      results {
        job {
          key
          title
          datePublished
          description { html }
          location {
            city
            admin1Code
            countryCode
            formatted { short long }
          }
          compensation {
            baseSalary {
              unitOfWork
              range { ... on Range { min max } }
            }
            currencyCode
          }
          attributes { key label }
          employer {
            name
            relativeCompanyPageUrl
          }
          recruit { viewJobUrl }
        }
      }
    }
  }
`;

export interface IndeedSearchResult {
  id: string;
  title: string;
  companyName: string | null;
  location: string;
  description: string;
  descriptionHtml: string;
  url: string;
  directUrl: string | null;
  salary: string | null;
  datePosted: string | null;
  isRemote: boolean;
  attributes: string[];
}

export async function searchIndeed(opts: {
  query?: string;
  location?: string;
  limit?: number;
  hoursOld?: number;
}): Promise<IndeedSearchResult[]> {
  const limit = Math.min(opts.limit ?? 25, 100);
  const what = opts.query ? `what: "${opts.query.replace(/"/g, '\\"')}"` : "";
  const location = opts.location
    ? `location: {where: "${opts.location}", radius: 25, radiusUnit: MILES}`
    : "";
  const filters = opts.hoursOld
    ? `filters: { date: { field: "dateOnIndeed", start: "${opts.hoursOld}h" } }`
    : "";

  const query = INDEED_QUERY.replace("{what}", what)
    .replace("{location}", location)
    .replace("{limit}", String(limit))
    .replace("{cursor}", "")
    .replace("{filters}", filters);

  const res = await fetch(INDEED_API, {
    method: "POST",
    headers: INDEED_HEADERS,
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`Indeed API error: ${res.status}`);
  }

  const data = await res.json();
  const results = data?.data?.jobSearch?.results ?? [];

  return results.map((r: Record<string, unknown>) => {
    const job = r.job as Record<string, unknown>;
    const employer = job.employer as Record<string, unknown> | null;
    const loc = job.location as Record<string, unknown>;
    const formatted = loc?.formatted as Record<string, string> | null;
    const comp = job.compensation as Record<string, unknown> | null;
    const desc = job.description as Record<string, string>;
    const recruit = job.recruit as Record<string, string> | null;
    const attrs = (job.attributes as Array<{ key: string; label: string }>) ?? [];

    // Build salary string
    let salary: string | null = null;
    if (comp?.baseSalary) {
      const bs = comp.baseSalary as Record<string, unknown>;
      const range = bs.range as { min?: number; max?: number } | null;
      if (range?.min || range?.max) {
        const currency = (comp.currencyCode as string) || "CAD";
        const unit = (bs.unitOfWork as string) || "";
        const parts = [];
        if (range.min) parts.push(`${currency} ${range.min.toLocaleString()}`);
        if (range.max) parts.push(`${currency} ${range.max.toLocaleString()}`);
        salary = parts.join(" - ") + (unit ? ` / ${unit.toLowerCase()}` : "");
      }
    }

    // Parse date
    const datePublished = job.datePublished as number | null;
    const datePosted = datePublished
      ? new Date(datePublished).toISOString().split("T")[0]
      : null;

    const isRemote = attrs.some(
      (a) => a.key === "DSQF7" || a.label?.toLowerCase().includes("remote"),
    );

    return {
      id: `in-${job.key}`,
      title: (job.title as string) || "",
      companyName: (employer?.name as string) || null,
      location: formatted?.short || formatted?.long || "",
      description: desc?.html ? htmlToText(desc.html) : "",
      descriptionHtml: desc?.html || "",
      url: `https://ca.indeed.com/viewjob?jk=${job.key}`,
      directUrl: recruit?.viewJobUrl || null,
      salary,
      datePosted,
      isRemote,
      attributes: attrs.map((a) => a.label),
    };
  });
}

// ── LinkedIn (HTML scraping) ─────────────────────────────────────────

const LINKEDIN_BASE = "https://www.linkedin.com";
const LINKEDIN_HEADERS = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export interface LinkedInSearchResult {
  id: string;
  title: string;
  companyName: string | null;
  companyUrl: string | null;
  location: string;
  url: string;
  datePosted: string | null;
  salary: string | null;
}

export async function searchLinkedIn(opts: {
  query?: string;
  location?: string;
  limit?: number;
}): Promise<LinkedInSearchResult[]> {
  const limit = Math.min(opts.limit ?? 25, 50);
  const params = new URLSearchParams();
  if (opts.query) params.set("keywords", opts.query);
  if (opts.location) params.set("location", opts.location);
  params.set("start", "0");

  const url = `${LINKEDIN_BASE}/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`;

  const res = await fetch(url, { headers: LINKEDIN_HEADERS });
  if (!res.ok) {
    if (res.status === 429) throw new Error("LinkedIn rate limited (429). Try again later.");
    throw new Error(`LinkedIn error: ${res.status}`);
  }

  const html = await res.text();

  // Parse job cards from HTML
  const jobs: LinkedInSearchResult[] = [];
  const cardRegex =
    /data-entity-urn="urn:li:jobPosting:(\d+)"[\s\S]*?<span class="sr-only">\s*([\s\S]*?)\s*<\/span>[\s\S]*?<h4 class="base-search-card__subtitle[^"]*">\s*(?:<a[^>]*>)?\s*([\s\S]*?)\s*(?:<\/a>)?\s*<\/h4>[\s\S]*?<span class="job-search-card__location">\s*([\s\S]*?)\s*<\/span>/g;

  let match;
  while ((match = cardRegex.exec(html)) !== null && jobs.length < limit) {
    const [, jobId, title, company, location] = match;

    // Try to find salary
    const salaryRegex = new RegExp(
      `data-entity-urn="urn:li:jobPosting:${jobId}"[\\s\\S]*?<span class="job-search-card__salary-info">\\s*([\\s\\S]*?)\\s*</span>`,
    );
    const salaryMatch = salaryRegex.exec(html);
    const salary = salaryMatch ? salaryMatch[1].trim() : null;

    // Try to find date
    const dateRegex = new RegExp(
      `data-entity-urn="urn:li:jobPosting:${jobId}"[\\s\\S]*?<time[^>]*datetime="(\\d{4}-\\d{2}-\\d{2})"`,
    );
    const dateMatch = dateRegex.exec(html);

    jobs.push({
      id: `li-${jobId}`,
      title: title.trim(),
      companyName: company.replace(/<[^>]+>/g, "").trim() || null,
      companyUrl: null,
      location: location.trim(),
      url: `${LINKEDIN_BASE}/jobs/view/${jobId}`,
      datePosted: dateMatch ? dateMatch[1] : null,
      salary,
    });
  }

  return jobs;
}
