/**
 * ADP Job Importer
 *
 * Supports ADP Workforce Now recruiting pages using the public RAAS endpoint.
 *
 * Source identifier formats:
 * - "{cid}:{ccId}" (lang defaults to en_CA)
 * - "{cid}:{ccId}:{lang}"
 * - full recruitment URL containing cid/ccId/lang query params
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
  WorkplaceType,
} from "./types";
import { htmlToText } from "./text.server";

const BASE_URL = "https://workforcenow.adp.com";
const PUBLIC_REQUISITIONS_PATH = "/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions";
const DEFAULT_LANG = "en_CA";
const PAGE_SIZE = 20;

type AdpConfig = {
  cid: string;
  ccId: string;
  lang: string;
};

interface AdpCodeValue {
  codeValue?: string;
  shortName?: string;
}

interface AdpCustomField {
  nameCode?: AdpCodeValue;
  categoryCode?: AdpCodeValue;
  stringValue?: string;
  dateValue?: string;
  indicatorValue?: boolean;
  numberValue?: number;
}

interface AdpJobRequisition {
  itemID: string;
  requisitionTitle: string;
  requisitionDescription?: string;
  clientRequisitionID?: string;
  workLevelCode?: AdpCodeValue;
  requisitionLocations?: Array<{
    nameCode?: AdpCodeValue;
    address?: {
      cityName?: string;
      countrySubdivisionLevel1?: AdpCodeValue;
      postalCode?: string;
    };
  }>;
  customFieldGroup?: {
    dateFields?: AdpCustomField[];
    indicatorFields?: AdpCustomField[];
    numberFields?: AdpCustomField[];
    stringFields?: AdpCustomField[];
  };
}

interface AdpJobsResponse {
  jobRequisitions: AdpJobRequisition[];
  meta?: {
    totalNumber?: number;
  };
}

function decodeAdpEntities(text: string): string {
  return text
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function parseSourceIdentifier(identifier: string): AdpConfig {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new Error("ADP source identifier is required");
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    const cid = url.searchParams.get("cid")?.trim() ?? "";
    const ccId = url.searchParams.get("ccId")?.trim() ?? "";
    const lang = url.searchParams.get("lang")?.trim() ?? DEFAULT_LANG;
    if (!cid || !ccId) {
      throw new Error("ADP URL must include cid and ccId query params");
    }
    return { cid, ccId, lang };
  }

  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.length < 2) {
    throw new Error(
      'Invalid ADP source identifier. Use "cid:ccId", "cid:ccId:lang", or full recruitment URL.'
    );
  }

  return {
    cid: parts[0],
    ccId: parts[1],
    lang: parts[2] || DEFAULT_LANG,
  };
}

function buildRequisitionsUrl(config: AdpConfig, skip: number, top = PAGE_SIZE): string {
  const url = new URL(`${BASE_URL}${PUBLIC_REQUISITIONS_PATH}`);
  url.searchParams.set("cid", config.cid);
  url.searchParams.set("ccId", config.ccId);
  url.searchParams.set("lang", config.lang);
  url.searchParams.set("locale", config.lang);
  url.searchParams.set("$skip", String(skip));
  url.searchParams.set("$top", String(top));
  url.searchParams.set("sortBy", "postDate");
  url.searchParams.set("sortOrder", "desc");
  url.searchParams.set("timeStamp", String(Date.now()));
  return url.toString();
}

function buildRequisitionDetailUrl(config: AdpConfig, itemId: string): string {
  const url = new URL(`${BASE_URL}${PUBLIC_REQUISITIONS_PATH}/${encodeURIComponent(itemId)}`);
  url.searchParams.set("cid", config.cid);
  url.searchParams.set("ccId", config.ccId);
  url.searchParams.set("lang", config.lang);
  url.searchParams.set("locale", config.lang);
  url.searchParams.set("timeStamp", String(Date.now()));
  return url.toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`ADP API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function getStringFieldValue(job: AdpJobRequisition, codeValue: string): string | undefined {
  const field = job.customFieldGroup?.stringFields?.find(
    (entry) => entry.nameCode?.codeValue === codeValue && entry.stringValue
  );
  return field?.stringValue?.trim() || undefined;
}

function getDateFieldValue(job: AdpJobRequisition, codeValue: string): Date | undefined {
  const field = job.customFieldGroup?.dateFields?.find(
    (entry) => entry.nameCode?.codeValue === codeValue && entry.dateValue
  );
  if (!field?.dateValue) return undefined;
  const parsed = new Date(field.dateValue);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function getLocation(job: AdpJobRequisition): string | undefined {
  const locations = job.requisitionLocations ?? [];
  const mapped = locations
    .map((location) => {
      const name = location.nameCode?.shortName
        ? decodeAdpEntities(location.nameCode.shortName).replace(/\s+,/g, ",").trim()
        : "";
      const city = location.address?.cityName ? decodeAdpEntities(location.address.cityName).trim() : "";
      const region = location.address?.countrySubdivisionLevel1?.codeValue?.trim() ?? "";
      if (name) return name;
      return [city, region].filter(Boolean).join(", ");
    })
    .filter(Boolean);

  return mapped.length > 0 ? mapped.join("; ") : undefined;
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

function convertJob(job: AdpJobRequisition): FetchedJob {
  const externalId = getStringFieldValue(job, "ExternalJobID") || job.itemID;
  const descriptionHtml = job.requisitionDescription || undefined;
  const descriptionText = descriptionHtml ? htmlToText(decodeAdpEntities(descriptionHtml)) : undefined;
  const location = getLocation(job);
  const workplaceType = detectWorkplaceType(`${location ?? ""}\n${descriptionText ?? ""}`);

  return {
    externalId,
    title: decodeAdpEntities(job.requisitionTitle).trim(),
    location,
    department: getStringFieldValue(job, "HomeDepartment"),
    descriptionHtml,
    descriptionText,
    url: "",
    workplaceType,
    postedAt: getDateFieldValue(job, "PostingDate"),
  };
}

function buildRecruitmentUrl(config: AdpConfig): string {
  const url = new URL("https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html");
  url.searchParams.set("cid", config.cid);
  url.searchParams.set("ccId", config.ccId);
  url.searchParams.set("lang", config.lang);
  url.searchParams.set("selectedMenuKey", "CurrentOpenings");
  return url.toString();
}

function buildRecruitmentJobUrl(config: AdpConfig, job: AdpJobRequisition): string {
  const jobId = getStringFieldValue(job, "ExternalJobID") || job.clientRequisitionID || job.itemID;
  const url = new URL("https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html");
  url.searchParams.set("cid", config.cid);
  url.searchParams.set("jobId", jobId);
  url.searchParams.set("selectedMenuKey", "CurrentOpenings");
  return url.toString();
}

export const adpImporter: JobImporter = {
  sourceType: "adp",

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const adp = parseSourceIdentifier(config.sourceIdentifier);
    const fallbackUrl = config.sourceUrl || buildRecruitmentUrl(adp);

    const allListings: AdpJobRequisition[] = [];
    let skip = 0;

    while (true) {
      const page = await fetchJson<AdpJobsResponse>(buildRequisitionsUrl(adp, skip));
      const jobs = page.jobRequisitions ?? [];
      if (jobs.length === 0) break;

      allListings.push(...jobs);

      const total = page.meta?.totalNumber ?? allListings.length;
      skip += jobs.length;
      if (skip >= total) break;
      if (jobs.length < PAGE_SIZE) break;
    }

    const results: FetchedJob[] = [];
    for (const listing of allListings) {
      let detail: AdpJobRequisition = listing;
      try {
        detail = await fetchJson<AdpJobRequisition>(buildRequisitionDetailUrl(adp, listing.itemID));
      } catch {
        // Fallback to listing payload when details endpoint fails.
      }

      const converted = convertJob(detail);
      converted.url = buildRecruitmentJobUrl(adp, detail);
      if (!converted.externalId || !converted.title) continue;
      if (!converted.url) converted.url = fallbackUrl;
      results.push(converted);
    }

    return results;
  },

  async fetchJobDetails(jobId: string, config: ImportSourceConfig): Promise<FetchedJob | null> {
    const adp = parseSourceIdentifier(config.sourceIdentifier);
    try {
      const detail = await fetchJson<AdpJobRequisition>(buildRequisitionDetailUrl(adp, jobId));
      const converted = convertJob(detail);
      converted.url = buildRecruitmentJobUrl(adp, detail);
      return converted;
    } catch {
      return null;
    }
  },

  async validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult> {
    try {
      const adp = parseSourceIdentifier(config.sourceIdentifier);
      const response = await fetchJson<AdpJobsResponse>(buildRequisitionsUrl(adp, 0, 5));
      return {
        valid: true,
        jobCount: response.meta?.totalNumber ?? response.jobRequisitions?.length ?? 0,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
