/**
 * Collage Job Importer
 * Fetches jobs from Collage's public career site by scraping HTML
 *
 * Collage URLs follow the pattern:
 *   https://secure.collage.co/jobs/{company}
 *
 * No public JSON API exists, so we parse server-rendered HTML.
 *
 * The sourceIdentifier is the company slug (e.g., "heyorca", "solacepower")
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
  WorkplaceType,
} from "./types";
import { htmlToText } from "./text.server";
import { parseHTML } from "linkedom";

const BASE_URL = "https://secure.collage.co";

/**
 * Parse job listings from the Collage careers listing page HTML
 *
 * Structure:
 *   <div class="ATS-posting">
 *     <h1 class="ATS-department">Department Name</h1>
 *     <ul class="ATS-positions">
 *       <li><a href="/jobs/company/12345">
 *         <div class="ATS-position-title">Job Title</div>
 *         <span class="ATS-commitment-and-location">Full Time • City, Province • Remote</span>
 *       </a></li>
 *     </ul>
 *   </div>
 */
function parseListingPage(
  html: string,
  company: string
): Array<{
  id: string;
  title: string;
  department: string;
  commitment: string;
  location: string;
  workplaceType: WorkplaceType | undefined;
  url: string;
}> {
  const jobs: Array<{
    id: string;
    title: string;
    department: string;
    commitment: string;
    location: string;
    workplaceType: WorkplaceType | undefined;
    url: string;
  }> = [];

  const { document } = parseHTML(html);
  for (const posting of Array.from(document.querySelectorAll(".ATS-posting"))) {
    const department = posting.querySelector(".ATS-department")?.textContent?.trim() ?? "";
    for (const link of Array.from(posting.querySelectorAll(`a[href*="/jobs/${company}/"]`))) {
      const href = link.getAttribute("href") ?? "";
      const jobId = href.match(new RegExp(`/jobs/${escapeRegex(company)}/(\\d+)`))?.[1];
      if (!jobId) continue;

      const title = link.querySelector(".ATS-position-title")?.textContent?.trim() ?? "";
      if (!title) continue;

      const metaNode = link.querySelector(".ATS-commitment-and-location");
      const parts = (metaNode?.textContent ?? "")
        .split("•")
        .map((part) => part.trim())
        .filter(Boolean);

      let commitment = parts[0] ?? "";
      let location = parts.slice(1).join(", ");
      let workplaceType: WorkplaceType | undefined;
      const locationLower = location.toLowerCase();
      if (locationLower.includes("remote")) {
        workplaceType = locationLower.includes("hybrid") ? "hybrid" : "remote";
        location = parts
          .slice(1)
          .filter((part) => !["remote", "hybrid"].includes(part.toLowerCase()))
          .join(", ");
      } else if (locationLower.includes("hybrid")) {
        workplaceType = "hybrid";
        location = parts
          .slice(1)
          .filter((part) => part.toLowerCase() !== "hybrid")
          .join(", ");
      }

      jobs.push({
        id: jobId,
        title,
        department,
        commitment,
        location: location || "",
        workplaceType,
        url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      });
    }
  }

  return jobs;
}

/**
 * Parse a job detail page to extract the full description
 *
 * Structure:
 *   <h1 class="ATS-position-title-main">Job Title</h1>
 *   <p class="ATS-commitment-and-location"><span>Dept</span> • <span>Full Time</span> • ...</p>
 *   <div class="ATS-position-description">...HTML content...</div>
 */
function parseDetailPage(html: string): {
  title: string;
  descriptionHtml: string;
  metadata: string[];
} {
  const { document } = parseHTML(html);
  const title = document.querySelector(".ATS-position-title-main")?.textContent?.trim() ?? "";

  const metadata: string[] = [];
  const metaNode = document.querySelector(".ATS-commitment-and-location");
  if (metaNode) {
    for (const span of Array.from(metaNode.querySelectorAll("span"))) {
      const text = span.textContent?.trim();
      if (text) metadata.push(text);
      span.remove();
    }
    const trailing = metaNode.textContent?.trim();
    if (trailing) metadata.push(trailing);
  }

  const descriptionNode = document.querySelector(".ATS-position-description");
  const descriptionHtml = descriptionNode?.innerHTML?.trim() ?? "";

  return { title, descriptionHtml, metadata };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fetch the HTML of a Collage page
 */
async function fetchCollagePage(path: string): Promise<string> {
  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Collage career site not found at ${url}`);
    }
    throw new Error(`Collage fetch error: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export const collageImporter: JobImporter = {
  sourceType: "collage",

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const company = config.sourceIdentifier;

    // Fetch listing page
    const listingHtml = await fetchCollagePage(`/jobs/${company}`);
    const listings = parseListingPage(listingHtml, company);

    const jobs: FetchedJob[] = [];

    // Fetch detail page for each job to get full description
    for (const listing of listings) {
      try {
        const detailHtml = await fetchCollagePage(`/jobs/${company}/${listing.id}`);
        const detail = parseDetailPage(detailHtml);

        jobs.push({
          externalId: listing.id,
          title: detail.title || listing.title,
          location: listing.location || undefined,
          department: listing.department || undefined,
          descriptionHtml: detail.descriptionHtml || undefined,
          descriptionText: detail.descriptionHtml
            ? htmlToText(detail.descriptionHtml)
            : undefined,
          url: listing.url,
          workplaceType: listing.workplaceType,
        });
      } catch (e) {
        // If detail fetch fails, use listing data only
        console.warn(`Failed to fetch details for Collage job ${listing.id}:`, e);
        jobs.push({
          externalId: listing.id,
          title: listing.title,
          location: listing.location || undefined,
          department: listing.department || undefined,
          url: listing.url,
          workplaceType: listing.workplaceType,
        });
      }
    }

    return jobs;
  },

  async fetchJobDetails(
    jobId: string,
    config: ImportSourceConfig
  ): Promise<FetchedJob | null> {
    const company = config.sourceIdentifier;

    try {
      const detailHtml = await fetchCollagePage(`/jobs/${company}/${jobId}`);
      const detail = parseDetailPage(detailHtml);

      return {
        externalId: jobId,
        title: detail.title,
        descriptionHtml: detail.descriptionHtml || undefined,
        descriptionText: detail.descriptionHtml
          ? htmlToText(detail.descriptionHtml)
          : undefined,
        url: `${BASE_URL}/jobs/${company}/${jobId}`,
      };
    } catch {
      return null;
    }
  },

  async validateConfig(
    config: Omit<ImportSourceConfig, "id">
  ): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return {
        valid: false,
        error:
          "Company slug is required (e.g., 'heyorca' from secure.collage.co/jobs/heyorca)",
      };
    }

    try {
      const listingHtml = await fetchCollagePage(
        `/jobs/${config.sourceIdentifier}`
      );
      const listings = parseListingPage(listingHtml, config.sourceIdentifier);
      return {
        valid: true,
        jobCount: listings.length,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
