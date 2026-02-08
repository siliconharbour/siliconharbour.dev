/**
 * Rippling Job Importer
 * Fetches jobs from Rippling's ATS by extracting __NEXT_DATA__ from server-rendered pages
 *
 * Rippling URLs follow the pattern:
 *   https://ats.rippling.com/{company}/jobs
 *
 * No public JSON API exists, but job data is embedded in __NEXT_DATA__ on every page.
 *
 * The sourceIdentifier is the company slug (e.g., "kraken-robotics-inc")
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

const BASE_URL = "https://ats.rippling.com";

interface RipplingLocation {
  name: string;
  country: string;
  countryCode: string;
  state: string;
  stateCode: string;
  city: string;
  workplaceType: string; // "ON_SITE", "REMOTE", "HYBRID"
}

interface RipplingJobListing {
  id: string;
  name: string;
  url: string;
  department: { name: string } | null;
  locations: RipplingLocation[];
  language: string;
}

interface RipplingJobDetail {
  uuid: string;
  name: string;
  description: {
    company?: string;
    role?: string;
    team?: string;
    compensation?: string;
  };
  department: { name: string } | null;
  locations: RipplingLocation[];
  employmentType: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface RipplingPageData {
  props: {
    pageProps: {
      apiData: {
        jobBoardSlug?: string;
        jobBoard?: { slug: string };
        jobPost?: RipplingJobDetail;
        filtersConfig?: {
          workLocations: unknown[];
          departments: unknown[];
        };
      };
      dehydratedState?: {
        queries: Array<{
          state: {
            data: {
              items: RipplingJobListing[];
            };
          };
        }>;
      };
    };
  };
}

/**
 * Extract __NEXT_DATA__ JSON from a Rippling page
 */
function extractNextData(html: string): RipplingPageData | null {
  const { document } = parseHTML(html);
  const script = document.querySelector('script#__NEXT_DATA__');
  const payload = script?.textContent?.trim();
  if (!payload) return null;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Convert Rippling workplace type to our WorkplaceType
 */
function convertWorkplaceType(
  ripplingType: string | undefined
): WorkplaceType | undefined {
  if (!ripplingType) return undefined;
  switch (ripplingType) {
    case "ON_SITE":
      return "onsite";
    case "REMOTE":
      return "remote";
    case "HYBRID":
      return "hybrid";
    default:
      return undefined;
  }
}

/**
 * Format location from Rippling location objects
 */
function formatLocation(locations: RipplingLocation[]): string | undefined {
  if (!locations || locations.length === 0) return undefined;

  const parts = locations.map((loc) => {
    if (loc.city && loc.stateCode) return `${loc.city}, ${loc.stateCode}`;
    if (loc.city) return loc.city;
    return loc.name;
  });

  return [...new Set(parts)].join("; ");
}

/**
 * Get the primary workplace type from locations
 */
function getWorkplaceType(
  locations: RipplingLocation[]
): WorkplaceType | undefined {
  if (!locations || locations.length === 0) return undefined;
  // Use the first location's workplace type
  return convertWorkplaceType(locations[0].workplaceType);
}

/**
 * Build the full description HTML from Rippling job detail sections
 */
function buildDescriptionHtml(
  description: RipplingJobDetail["description"]
): string {
  const parts: string[] = [];

  const clean = (raw: string) => {
    const { document } = parseHTML(raw);
    for (const meta of Array.from(document.querySelectorAll("meta"))) {
      meta.remove();
    }
    return document.body?.innerHTML?.trim() ?? raw;
  };

  if (description.company) parts.push(clean(description.company));
  if (description.role) parts.push(clean(description.role));
  if (description.team) parts.push(clean(description.team));
  if (description.compensation) parts.push(clean(description.compensation));

  return parts.join("\n");
}

/**
 * Fetch a Rippling page and extract __NEXT_DATA__
 */
async function fetchRipplingPage(path: string): Promise<RipplingPageData> {
  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Rippling career site not found at ${url}`);
    }
    throw new Error(
      `Rippling fetch error: ${response.status} ${response.statusText}`
    );
  }

  const html = await response.text();
  const data = extractNextData(html);

  if (!data) {
    throw new Error("Failed to extract job data from Rippling page");
  }

  return data;
}

export const ripplingImporter: JobImporter = {
  sourceType: "rippling",

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const company = config.sourceIdentifier;

    // Fetch the listing page - job listings are in dehydratedState
    const pageData = await fetchRipplingPage(`/${company}/jobs`);
    const queries =
      pageData.props?.pageProps?.dehydratedState?.queries || [];

    // Find the query that contains job items
    let listings: RipplingJobListing[] = [];
    for (const query of queries) {
      const items = query.state?.data?.items;
      if (Array.isArray(items) && items.length > 0) {
        listings = items;
        break;
      }
    }

    const jobs: FetchedJob[] = [];

    // Fetch detail page for each job to get full description
    for (const listing of listings) {
      try {
        const detailData = await fetchRipplingPage(
          `/${company}/jobs/${listing.id}`
        );
        const jobPost = detailData.props?.pageProps?.apiData?.jobPost;

        if (jobPost) {
          const descriptionHtml = buildDescriptionHtml(jobPost.description);
          jobs.push({
            externalId: listing.id,
            title: jobPost.name || listing.name,
            location:
              formatLocation(jobPost.locations) ||
              formatLocation(listing.locations),
            department:
              jobPost.department?.name ||
              listing.department?.name ||
              undefined,
            descriptionHtml: descriptionHtml || undefined,
            descriptionText: descriptionHtml
              ? htmlToText(descriptionHtml)
              : undefined,
            url: listing.url,
            workplaceType:
              getWorkplaceType(jobPost.locations) ||
              getWorkplaceType(listing.locations),
          });
        } else {
          // Fallback to listing data only
          jobs.push({
            externalId: listing.id,
            title: listing.name,
            location: formatLocation(listing.locations),
            department: listing.department?.name || undefined,
            url: listing.url,
            workplaceType: getWorkplaceType(listing.locations),
          });
        }
      } catch (e) {
        // If detail fetch fails, use listing data
        console.warn(
          `Failed to fetch details for Rippling job ${listing.id}:`,
          e
        );
        jobs.push({
          externalId: listing.id,
          title: listing.name,
          location: formatLocation(listing.locations),
          department: listing.department?.name || undefined,
          url: listing.url,
          workplaceType: getWorkplaceType(listing.locations),
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
      const detailData = await fetchRipplingPage(
        `/${company}/jobs/${jobId}`
      );
      const jobPost = detailData.props?.pageProps?.apiData?.jobPost;
      if (!jobPost) return null;

      const descriptionHtml = buildDescriptionHtml(jobPost.description);

      return {
        externalId: jobPost.uuid,
        title: jobPost.name,
        location: formatLocation(jobPost.locations),
        department: jobPost.department?.name || undefined,
        descriptionHtml: descriptionHtml || undefined,
        descriptionText: descriptionHtml
          ? htmlToText(descriptionHtml)
          : undefined,
        url: `${BASE_URL}/${company}/jobs/${jobPost.uuid}`,
        workplaceType: getWorkplaceType(jobPost.locations),
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
          "Company slug is required (e.g., 'kraken-robotics-inc' from ats.rippling.com/kraken-robotics-inc/jobs)",
      };
    }

    try {
      const pageData = await fetchRipplingPage(
        `/${config.sourceIdentifier}/jobs`
      );
      const queries =
        pageData.props?.pageProps?.dehydratedState?.queries || [];

      let count = 0;
      for (const query of queries) {
        const items = query.state?.data?.items;
        if (Array.isArray(items)) {
          count = items.length;
          break;
        }
      }

      return {
        valid: true,
        jobCount: count,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
