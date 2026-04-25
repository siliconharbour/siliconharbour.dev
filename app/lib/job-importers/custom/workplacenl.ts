/**
 * WorkplaceNL custom scraper
 *
 * Uses Oracle HCM Cloud REST API:
 * - List: recruitingCEJobRequisitions (finder=findReqs, siteNumber=CX_1)
 * - Detail: recruitingCEJobRequisitionDetails (finder=ById, siteNumber=CX_1)
 *
 * The list endpoint returns job IDs, titles, locations, and posted dates.
 * The detail endpoint returns full HTML descriptions and salary info.
 */

import type { FetchedJob, WorkplaceType } from "../types";
import { htmlToText } from "./utils";
import pLimit from "p-limit";

const ORACLE_BASE =
  "https://fa-etna-saasfaprod1.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest";
const SITE_NUMBER = "CX_1";
const JOB_PAGE_BASE =
  "https://fa-etna-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job";

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; SiliconHarbour/1.0; +https://siliconharbour.dev)",
  "ora-irc-language": "en",
};

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

async function fetchJobList(): Promise<OracleRequisition[]> {
  const url =
    `${ORACLE_BASE}/recruitingCEJobRequisitions?onlyData=true` +
    `&expand=requisitionList.secondaryLocations` +
    `&finder=findReqs;siteNumber=${SITE_NUMBER},limit=100,sortBy=POSTING_DATES_DESC`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Oracle HCM list API error: ${res.status}`);

  const data = await res.json();
  const items = data?.items?.[0]?.requisitionList ?? [];
  return items;
}

async function fetchJobDetail(jobId: string): Promise<OracleRequisitionDetail | null> {
  const url =
    `${ORACLE_BASE}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true` +
    `&finder=ById;Id=%22${jobId}%22,siteNumber=${SITE_NUMBER}`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;

  const data = await res.json();
  return data?.items?.[0] ?? null;
}

export async function scrapeWorkplaceNL(): Promise<FetchedJob[]> {
  const listings = await fetchJobList();
  if (listings.length === 0) return [];

  const limit = pLimit(3);
  const jobs: FetchedJob[] = [];

  await Promise.all(
    listings.map((listing) =>
      limit(async () => {
        const detail = await fetchJobDetail(listing.Id);

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
          location: location || "St. John's, NL",
          department: detail?.Category ?? listing.Category ?? undefined,
          descriptionHtml: descriptionHtml || undefined,
          descriptionText: descriptionHtml ? htmlToText(descriptionHtml) : undefined,
          url: `${JOB_PAGE_BASE}/${listing.Id}`,
          workplaceType,
          postedAt: listing.PostedDate ? new Date(listing.PostedDate) : undefined,
        });
      }),
    ),
  );

  return jobs;
}
