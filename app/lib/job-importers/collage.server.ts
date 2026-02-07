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

  // Match each ATS-posting block (department + its jobs)
  const postingBlocks = html.split('class="ATS-posting"');

  for (let i = 1; i < postingBlocks.length; i++) {
    const block = postingBlocks[i];

    // Extract department
    const deptMatch = block.match(
      /class="ATS-department"[^>]*>([^<]+)</
    );
    const department = deptMatch ? deptMatch[1].trim() : "";

    // Extract all job links within this block
    const jobLinkRegex = new RegExp(
      `href="(?:https://secure\\.collage\\.co)?/jobs/${escapeRegex(company)}/(\\d+)"`,
      "g"
    );

    let linkMatch;
    while ((linkMatch = jobLinkRegex.exec(block)) !== null) {
      const jobId = linkMatch[1];

      // Find the title near this link
      const linkPos = linkMatch.index;
      const nearbyHtml = block.substring(linkPos, linkPos + 1000);

      const titleMatch = nearbyHtml.match(
        /class="ATS-position-title"[^>]*>([^<]+)</
      );
      const title = titleMatch ? titleMatch[1].trim() : "";

      // Parse commitment and location from the outermost span
      // Use greedy match to get the full content (inner spans contain bullet points)
      const metaMatch = nearbyHtml.match(
        /class="[^"]*ATS-commitment-and-location[^"]*"[^>]*>([\s\S]*)<\/span>/
      );
      let commitment = "";
      let location = "";
      let workplaceType: WorkplaceType | undefined;

      if (metaMatch) {
        // The span contains text separated by bullet point spans
        const metaText = metaMatch[1]
          .replace(/<[^>]+>/g, "|")
          .replace(/\|+/g, "|")
          .trim();
        const parts = metaText
          .split("|")
          .map((p) => p.trim())
          .filter(Boolean);

        if (parts.length >= 1) commitment = parts[0];
        if (parts.length >= 2) location = parts.slice(1).join(", ");

        // Detect workplace type from location parts
        const locationLower = location.toLowerCase();
        if (locationLower.includes("remote")) {
          workplaceType = locationLower.includes("hybrid") ? "hybrid" : "remote";
          // Clean "Remote" from the location string
          location = parts
            .slice(1)
            .filter(
              (p) => p.toLowerCase() !== "remote" && p.toLowerCase() !== "hybrid"
            )
            .join(", ");
        } else if (locationLower.includes("hybrid")) {
          workplaceType = "hybrid";
          location = parts
            .slice(1)
            .filter((p) => p.toLowerCase() !== "hybrid")
            .join(", ");
        }
      }

      if (title && jobId) {
        jobs.push({
          id: jobId,
          title,
          department,
          commitment,
          location: location || "",
          workplaceType,
          url: `${BASE_URL}/jobs/${company}/${jobId}`,
        });
      }
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
  // Extract title
  const titleMatch = html.match(
    /class="[^"]*ATS-position-title-main[^"]*"[^>]*>([\s\S]*?)<\/h1>/
  );
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

  // Extract metadata spans
  const metaMatch = html.match(
    /class="[^"]*ATS-commitment-and-location[^"]*"[^>]*>([\s\S]*?)<\/p>/
  );
  const metadata: string[] = [];
  if (metaMatch) {
    const spanRegex = /<span[^>]*>([^<]*)<\/span>/g;
    let spanMatch;
    while ((spanMatch = spanRegex.exec(metaMatch[1])) !== null) {
      const text = spanMatch[1].trim();
      if (text) metadata.push(text);
    }
    // Also check for salary text after spans (e.g., "Up to $120,000 CAD per year")
    const afterSpans = metaMatch[1].replace(/<span[^>]*>.*?<\/span>/g, "").replace(/<[^>]+>/g, "").trim();
    if (afterSpans) metadata.push(afterSpans);
  }

  // Extract description
  const descMatch = html.match(
    /class="[^"]*ATS-position-description[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="flex|<footer)/
  );
  const descriptionHtml = descMatch ? descMatch[1].trim() : "";

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
