/**
 * Oracle HCM Job Importer
 *
 * Fetches jobs from Oracle HCM Cloud REST API career sites.
 *
 * sourceIdentifier format: {oracleHost}:{siteNumber}:{keyword}
 *   e.g. "emit.fa.ca3.oraclecloud.com:CX_2001:St. John's" (with keyword filter)
 *   e.g. "fa-etna-saasfaprod1.fa.ocs.oraclecloud.com:CX_1:" (no keyword filter)
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

/**
 * Parse sourceIdentifier into host, siteNumber, and optional keyword.
 * Format: host:siteNumber:keyword (keyword may be empty)
 */
function parseIdentifier(sourceIdentifier: string): {
  host: string;
  siteNumber: string;
  keyword: string;
} {
  // Split on first two colons only — keyword may contain colons
  const firstColon = sourceIdentifier.indexOf(":");
  if (firstColon === -1) {
    throw new Error(
      `Invalid Oracle HCM sourceIdentifier: "${sourceIdentifier}". ` +
        "Expected format: host:siteNumber:keyword",
    );
  }
  const host = sourceIdentifier.slice(0, firstColon);
  const rest = sourceIdentifier.slice(firstColon + 1);

  const secondColon = rest.indexOf(":");
  if (secondColon === -1) {
    throw new Error(
      `Invalid Oracle HCM sourceIdentifier: "${sourceIdentifier}". ` +
        "Expected format: host:siteNumber:keyword",
    );
  }
  const siteNumber = rest.slice(0, secondColon);
  const keyword = rest.slice(secondColon + 1);

  return { host, siteNumber, keyword };
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

async function fetchJobList(
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
      "sourceIdentifier format: host:siteNumber:keyword. Keyword is optional location filter.",
  },

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const { host, siteNumber, keyword } = parseIdentifier(config.sourceIdentifier);
    const listings = await fetchJobList(host, siteNumber, keyword);
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
          "Oracle HCM sourceIdentifier required. Format: host:siteNumber:keyword " +
          "(e.g., emit.fa.ca3.oraclecloud.com:CX_2001:St. John's)",
      };
    }

    try {
      const { host, siteNumber, keyword } = parseIdentifier(config.sourceIdentifier);
      const listings = await fetchJobList(host, siteNumber, keyword);
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
