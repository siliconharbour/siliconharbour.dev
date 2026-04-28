/**
 * Oracle HCM Job Importer
 *
 * Fetches jobs from Oracle HCM Cloud REST API career sites.
 *
 * sourceIdentifier format:
 *   Keyword mode: {host}:{siteNumber}:{keyword}
 *     e.g. "fa-etna-saasfaprod1.fa.ocs.oraclecloud.com:CX_1:" (no keyword filter)
 *
 *   Location mode: {host}:{siteNumber}:@{locationId}:{locationFilter}
 *     e.g. "emit.fa.ca3.oraclecloud.com:CX_2001:@300000000314850:St. John's"
 *     Uses locationId to scope API query (e.g. Canada = 300000000314850),
 *     then filters results client-side by locationFilter in PrimaryLocation.
 *     Best for large tenants where keyword search is unreliable.
 *
 * API endpoints:
 *   List: GET https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions
 *   Detail: GET https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
  WorkplaceType,
} from "./types";
import { htmlToText } from "./text.server";
import pLimit from "p-limit";

// -- Request headers --------------------------------------------------------

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)",
  "ora-irc-language": "en",
};

// -- Oracle API response types ----------------------------------------------

interface OracleRequisition {
  Id: string;
  Title: string;
  PostedDate: string;
  PrimaryLocation: string;
  PrimaryLocationCountry: string;
  WorkplaceTypeCode: string | null;
  WorkplaceType: string;
  JobSchedule: string | null;
  Department: string | null;
  Category: string | null;
  secondaryLocations?: Array<{ Name: string }>;
}

interface OracleRequisitionDetail {
  Id: string;
  Title: string;
  ExternalDescriptionStr: string;
  CorporateDescriptionStr: string;
  ExternalQualificationsStr: string;
  ExternalResponsibilitiesStr: string;
  PrimaryLocation: string;
  WorkplaceType: string;
  WorkplaceTypeCode: string | null;
  JobSchedule: string | null;
  Category: string | null;
  ExternalPostedStartDate: string;
  requisitionFlexFields?: Array<{ Prompt: string; Value: string }>;
  secondaryLocations?: Array<{ Name: string }>;
}

// -- Helpers ----------------------------------------------------------------

type IdentifierConfig =
  | { mode: "keyword"; host: string; siteNumber: string; keyword: string }
  | { mode: "location"; host: string; siteNumber: string; locationId: string; locationFilter: string };

/**
 * Parse sourceIdentifier into config.
 *
 * Keyword mode:  host:siteNumber:keyword
 * Location mode: host:siteNumber:@locationId:locationFilter
 */
function parseIdentifier(sourceIdentifier: string): IdentifierConfig {
  const firstColon = sourceIdentifier.indexOf(":");
  if (firstColon === -1) {
    throw new Error(
      `Invalid Oracle HCM sourceIdentifier: "${sourceIdentifier}". ` +
        "Expected format: host:siteNumber:keyword or host:siteNumber:@locationId:locationFilter",
    );
  }
  const host = sourceIdentifier.slice(0, firstColon);
  const rest = sourceIdentifier.slice(firstColon + 1);

  const secondColon = rest.indexOf(":");
  if (secondColon === -1) {
    throw new Error(
      `Invalid Oracle HCM sourceIdentifier: "${sourceIdentifier}". ` +
        "Expected format: host:siteNumber:keyword or host:siteNumber:@locationId:locationFilter",
    );
  }
  const siteNumber = rest.slice(0, secondColon);
  const remainder = rest.slice(secondColon + 1);

  // Location mode: third segment starts with @
  if (remainder.startsWith("@")) {
    const thirdColon = remainder.indexOf(":", 1);
    if (thirdColon === -1) {
      throw new Error(
        `Invalid Oracle HCM location mode: "${sourceIdentifier}". ` +
          "Expected format: host:siteNumber:@locationId:locationFilter",
      );
    }
    const locationId = remainder.slice(1, thirdColon);
    const locationFilter = remainder.slice(thirdColon + 1);
    return { mode: "location", host, siteNumber, locationId, locationFilter };
  }

  return { mode: "keyword", host, siteNumber, keyword: remainder };
}

function detectWorkplaceType(code: string | null, text: string): WorkplaceType | undefined {
  if (code === "ORA_REMOTE" || text.toLowerCase().includes("remote")) return "remote";
  if (code === "ORA_HYBRID" || text.toLowerCase().includes("hybrid")) return "hybrid";
  if (code === "ORA_ON_SITE" || text.toLowerCase().includes("on-site")) return "onsite";
  return undefined;
}

function buildLocation(primary: string, secondary?: Array<{ Name: string }>): string {
  const locations = [primary];
  if (secondary) {
    for (const loc of secondary) {
      if (!locations.includes(loc.Name)) locations.push(loc.Name);
    }
  }
  return locations.join("; ");
}

function buildDescriptionHtml(detail: OracleRequisitionDetail): string {
  const parts: string[] = [];

  if (detail.ExternalDescriptionStr) parts.push(detail.ExternalDescriptionStr);
  if (detail.ExternalResponsibilitiesStr) {
    parts.push("<h3>Responsibilities</h3>");
    parts.push(detail.ExternalResponsibilitiesStr);
  }
  if (detail.ExternalQualificationsStr) {
    parts.push("<h3>Qualifications</h3>");
    parts.push(detail.ExternalQualificationsStr);
  }

  // Add salary/flex fields if present
  if (detail.requisitionFlexFields && detail.requisitionFlexFields.length > 0) {
    const fields = detail.requisitionFlexFields
      .filter((f) => f.Value && f.Value.trim())
      .map((f) => `<li><strong>${f.Prompt}:</strong> ${f.Value}</li>`)
      .join("");
    if (fields) parts.push(`<ul>${fields}</ul>`);
  }

  return parts.join("\n");
}

// -- API fetch --------------------------------------------------------------

async function fetchJobListByKeyword(
  host: string,
  siteNumber: string,
  keyword: string,
): Promise<OracleRequisition[]> {
  let url =
    `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true` +
    `&expand=requisitionList.secondaryLocations` +
    `&finder=findReqs;siteNumber=${siteNumber},limit=100,sortBy=POSTING_DATES_DESC`;

  if (keyword) {
    url += `,keyword="${encodeURIComponent(keyword)}"`;
  }

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Oracle HCM list API error: ${res.status}`);

  const data = await res.json();
  const items = data?.items?.[0]?.requisitionList ?? [];
  return items;
}

/**
 * Fetch jobs by locationId with pagination, filtering client-side by locationFilter.
 * Used for large tenants where keyword search misses jobs.
 */
async function fetchJobListByLocation(
  host: string,
  siteNumber: string,
  locationId: string,
  locationFilter: string,
): Promise<OracleRequisition[]> {
  const PAGE_SIZE = 100;
  const MAX_PAGES = 10; // Safety limit: 1000 jobs max
  const allItems: OracleRequisition[] = [];
  const filterLower = locationFilter.toLowerCase();

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const url =
      `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true` +
      `&expand=requisitionList.secondaryLocations` +
      `&finder=findReqs;siteNumber=${siteNumber},limit=${PAGE_SIZE},offset=${offset},sortBy=POSTING_DATES_DESC,locationId=${locationId}`;

    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Oracle HCM list API error: ${res.status}`);

    const data = await res.json();
    const items: OracleRequisition[] = data?.items?.[0]?.requisitionList ?? [];
    if (items.length === 0) break;

    // Client-side filter by location
    for (const item of items) {
      const loc = item.PrimaryLocation?.toLowerCase() ?? "";
      const secondaryMatch = item.secondaryLocations?.some(
        (s) => s.Name?.toLowerCase().includes(filterLower),
      );
      if (loc.includes(filterLower) || secondaryMatch) {
        allItems.push(item);
      }
    }

    // Check if there are more pages
    const total = data?.items?.[0]?.TotalJobsCount ?? 0;
    if (offset + items.length >= total) break;
  }

  return allItems;
}

async function fetchJobDetail(
  host: string,
  siteNumber: string,
  jobId: string,
): Promise<OracleRequisitionDetail | null> {
  const url =
    `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true` +
    `&finder=ById;Id=%22${jobId}%22,siteNumber=${siteNumber}`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;

  const data = await res.json();
  return data?.items?.[0] ?? null;
}

// -- Importer ---------------------------------------------------------------

export const oracleHcmImporter: JobImporter = {
  sourceType: "oracle-hcm",
  meta: {
    name: "Oracle HCM",
    approach:
      "Oracle HCM Cloud REST API. List endpoint for job IDs, detail endpoint for full descriptions and salary data.",
    style: "Clean API integration with detail fetch pass",
    reliability: "medium-high",
    quirks:
      "sourceIdentifier format: host:siteNumber:keyword (keyword mode) or host:siteNumber:@locationId:locationFilter (location mode). " +
      "Location mode paginates through a location tree and filters client-side — best for large tenants.",
  },

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const parsed = parseIdentifier(config.sourceIdentifier);
    const { host, siteNumber } = parsed;
    const listings =
      parsed.mode === "location"
        ? await fetchJobListByLocation(host, siteNumber, parsed.locationId, parsed.locationFilter)
        : await fetchJobListByKeyword(host, siteNumber, parsed.keyword);
    if (listings.length === 0) return [];

    const limit = pLimit(3);
    const jobs: FetchedJob[] = [];
    const jobPageBase = `https://${host}/hcmUI/CandidateExperience/en/sites/${siteNumber}/job`;

    await Promise.all(
      listings.map((listing) =>
        limit(async () => {
          const detail = await fetchJobDetail(host, siteNumber, listing.Id);

          const descriptionHtml = detail ? buildDescriptionHtml(detail) : "";
          const location = detail
            ? buildLocation(detail.PrimaryLocation, detail.secondaryLocations)
            : listing.PrimaryLocation;
          const workplaceType = detectWorkplaceType(
            detail?.WorkplaceTypeCode ?? listing.WorkplaceTypeCode,
            detail?.WorkplaceType ?? listing.WorkplaceType ?? "",
          );

          jobs.push({
            externalId: listing.Id,
            title: listing.Title,
            location: location || undefined,
            department: detail?.Category ?? listing.Category ?? undefined,
            descriptionHtml: descriptionHtml || undefined,
            descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
            url: `${jobPageBase}/${listing.Id}`,
            workplaceType,
            postedAt: listing.PostedDate ? new Date(listing.PostedDate) : undefined,
          });
        }),
      ),
    );

    return jobs;
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return {
        valid: false,
        error:
          "Oracle HCM sourceIdentifier required. Format: host:siteNumber:keyword or " +
          "host:siteNumber:@locationId:locationFilter",
      };
    }

    try {
      const parsed = parseIdentifier(config.sourceIdentifier);
      const { host, siteNumber } = parsed;
      const listings =
        parsed.mode === "location"
          ? await fetchJobListByLocation(host, siteNumber, parsed.locationId, parsed.locationFilter)
          : await fetchJobListByKeyword(host, siteNumber, parsed.keyword);
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
