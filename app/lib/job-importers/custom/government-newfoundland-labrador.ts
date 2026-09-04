/**
 * Government of Newfoundland and Labrador public-service job scraper.
 *
 * The Strategic Staffing site exposes all public competitions through a JSON
 * endpoint. We use its IT taxonomy as the primary filter, with narrow title
 * and organization fallbacks so clearly technical roles are not missed when
 * the source taxonomy is incomplete. Detail pages provide the full posting.
 */

import pLimit from "p-limit";
import type { FetchedJob } from "../types";
import { fetchJson, fetchPage, getNodeText, htmlToText, parseHtmlDocument } from "./utils";

const BASE_URL = "https://www.hiring.gov.nl.ca";
const PUBLIC_COMPETITIONS_URL = `${BASE_URL}/api/competitions/public`;
const IT_CATEGORY_ID = 34;
const IT_CATEGORY_NAME = "information technology and information management";

export interface GnlCompetitionSummary {
  id: number;
  compNumber: string;
  isInternal: boolean;
  isCancelled: boolean;
  closingDate: string | null;
  jobTitle: string;
  employer: string;
  parentEmployer: string;
  status: string;
  statusChangeDate: string | null;
  salary: string;
  locations: Array<{ locationId: number; locationName: string }>;
  positions: Array<{
    positionTypeId: number;
    positionType: string;
    numberOfPositions: number;
    showCount: boolean;
  }>;
  jobCategories: Array<{ jobCategoryId: number; jobCategoryName: string }>;
}

export type GnlTechnicalMatchReason =
  | "official-it-category"
  | "technical-title"
  | "technical-organization";

const DIRECT_TECHNICAL_TITLE_PATTERNS = [
  /\bartificial intelligence\b/i,
  /\bai\b/i,
  /\bmachine learning\b/i,
  /\bsoftware\b/i,
  /\bdevelopers?\b/i,
  /\bprogrammers?\b/i,
  /\bdevops\b/i,
  /\bcyber[ -]?security\b/i,
  /\binformation security\b/i,
  /\bbusiness intelligence\b/i,
  /\bweb ?services?\b/i,
  /\bwebmasters?\b/i,
  /\buser experience\b/i,
  /\buser interface\b/i,
  /\bscrum masters?\b/i,
  /\bux\b/i,
  /\bui\b/i,
  /\bdata (?:architects?|engineers?|scientists?)\b/i,
  /\b(?:gis|geomatics|geospatial)\b/i,
  /\btelecommunications?\b/i,
  /\b(?:help|service) ?desk\b/i,
  /\btechnical support\b/i,
];

const TECHNICAL_DOMAIN_PATTERN =
  /\b(?:applications?|automation|cloud|computer|data|database|digital (?:government|services?)|enterprise architecture|erp|information (?:management|systems?|technology)|infrastructure|it|microsoft 365|network|platform|sap|solutions?|systems?|technology)\b/i;
const TECHNICAL_ROLE_PATTERN =
  /\b(?:administrators?|analysts?|architects?|consultants?|designers?|engineers?|managers?|officers?|specialists?|technicians?|technologists?)\b/i;

const TECHNICAL_ORGANIZATION_PATTERNS = [
  /\boffice of the chief information officer\b/i,
  /\bprovincial radio communications office\b/i,
];

const NON_TECHNICAL_SUPPORT_TITLE_PATTERN =
  /\b(?:administrative|clerks?|executive assistants?|finance|financial|human resources|procurement)\b/i;
const NON_IT_ENGINEERING_TITLE_PATTERN =
  /\b(?:automotive|building|civil|construction|electrical|heavy equipment|highway|hvac|marine|mechanical|structural)\b/i;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function hasOfficialItCategory(competition: GnlCompetitionSummary): boolean {
  return competition.jobCategories.some(
    (category) =>
      category.jobCategoryId === IT_CATEGORY_ID ||
      normalizeText(category.jobCategoryName).toLowerCase() === IT_CATEGORY_NAME,
  );
}

/**
 * Explain why a competition belongs in the technical feed.
 *
 * Generic words such as "engineer" and "technician" are intentionally not
 * enough on their own: the GNL site also advertises civil, marine, automotive,
 * HVAC, and heavy-equipment roles.
 */
export function getGnlTechnicalMatchReason(
  competition: GnlCompetitionSummary,
): GnlTechnicalMatchReason | null {
  if (hasOfficialItCategory(competition)) return "official-it-category";

  const title = normalizeText(competition.jobTitle);
  if (DIRECT_TECHNICAL_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
    return "technical-title";
  }
  if (
    !NON_IT_ENGINEERING_TITLE_PATTERN.test(title) &&
    TECHNICAL_DOMAIN_PATTERN.test(title) &&
    TECHNICAL_ROLE_PATTERN.test(title)
  ) {
    return "technical-title";
  }

  const organization = normalizeText(`${competition.parentEmployer} ${competition.employer}`);
  if (
    TECHNICAL_ORGANIZATION_PATTERNS.some((pattern) => pattern.test(organization)) &&
    TECHNICAL_ROLE_PATTERN.test(title) &&
    !NON_TECHNICAL_SUPPORT_TITLE_PATTERN.test(title)
  ) {
    return "technical-organization";
  }

  return null;
}

function isCompetitionSummary(value: unknown): value is GnlCompetitionSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GnlCompetitionSummary>;
  return (
    typeof item.id === "number" &&
    typeof item.compNumber === "string" &&
    typeof item.jobTitle === "string" &&
    typeof item.employer === "string" &&
    typeof item.parentEmployer === "string" &&
    typeof item.status === "string" &&
    typeof item.isInternal === "boolean" &&
    typeof item.isCancelled === "boolean" &&
    Array.isArray(item.locations) &&
    Array.isArray(item.positions) &&
    Array.isArray(item.jobCategories)
  );
}

export function parseGnlCompetitionFeed(value: unknown): GnlCompetitionSummary[] {
  if (!Array.isArray(value)) {
    throw new Error("GNL public competitions API returned a non-array response");
  }

  const invalidIndex = value.findIndex((item) => !isCompetitionSummary(item));
  if (invalidIndex !== -1) {
    throw new Error(
      `GNL public competitions API returned an invalid item at index ${invalidIndex}`,
    );
  }

  return value;
}

const MONTHS = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index]),
);

function parseDisplayDate(value: string | undefined): Date | undefined {
  const match = value?.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return undefined;

  const month = MONTHS.get(match[1].toLowerCase());
  if (month === undefined) return undefined;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
}

function getMetadataValue(root: Element, label: string): string | undefined {
  const metadata = root.querySelector(".competition-detail-expaneded");
  if (!metadata) return undefined;

  for (const paragraph of metadata.querySelectorAll("p")) {
    const strong = paragraph.querySelector("strong");
    if (!strong) continue;
    const normalizedLabel = getNodeText(strong).replace(/:$/, "").trim();
    if (normalizedLabel.toLowerCase() !== label.toLowerCase()) continue;

    const paragraphText = getNodeText(paragraph);
    const labelText = getNodeText(strong);
    return normalizeText(paragraphText.slice(labelText.length));
  }
  return undefined;
}

function absolutizeLinks(element: Element): void {
  for (const anchor of element.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!href || /^(?:mailto:|tel:|#)/i.test(href)) continue;
    try {
      anchor.setAttribute("href", new URL(href, BASE_URL).toString());
    } catch {
      // Leave malformed source links untouched rather than losing the posting.
    }
  }
}

export interface ParsedGnlCompetitionDetail {
  title: string;
  descriptionHtml: string;
  descriptionText: string;
  postedAt?: Date;
}

export function parseGnlCompetitionDetail(
  html: string,
  fallbackTitle: string,
): ParsedGnlCompetitionDetail {
  const document = parseHtmlDocument(html);
  const root = document.querySelector(".competition-detail-page");
  if (!root) {
    throw new Error("GNL competition detail page did not contain the expected job markup");
  }

  const title = getNodeText(root.querySelector("h1")) || normalizeText(fallbackTitle);
  const sections = Array.from(root.children).filter(
    (child) => child.classList.contains("section") && !child.classList.contains("header"),
  );
  if (sections.length < 2) {
    throw new Error("GNL competition detail page did not contain the expected detail sections");
  }

  for (const section of sections) absolutizeLinks(section);
  const descriptionHtml = sections.map((section) => section.outerHTML).join("\n");

  return {
    title,
    descriptionHtml,
    descriptionText: htmlToText(descriptionHtml),
    postedAt: parseDisplayDate(getMetadataValue(root, "Posted Date")),
  };
}

function formatLocation(competition: GnlCompetitionSummary): string | undefined {
  const locations = [
    ...new Set(
      competition.locations.map((location) => normalizeText(location.locationName)).filter(Boolean),
    ),
  ];
  return locations.length > 0 ? locations.join("; ") : undefined;
}

function formatDepartment(competition: GnlCompetitionSummary): string | undefined {
  const names = [
    normalizeText(competition.parentEmployer),
    normalizeText(competition.employer),
  ].filter(Boolean);
  return [...new Set(names)].join(" — ") || undefined;
}

function parseExternalUpdatedAt(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function scrapeGovernmentNewfoundlandLabrador(): Promise<FetchedJob[]> {
  const response = await fetchJson<unknown>(PUBLIC_COMPETITIONS_URL);
  const competitions = parseGnlCompetitionFeed(response).filter(
    (competition) =>
      !competition.isInternal &&
      !competition.isCancelled &&
      competition.status.toLowerCase() === "posted" &&
      getGnlTechnicalMatchReason(competition) !== null,
  );

  const limit = pLimit(4);
  return Promise.all(
    competitions.map((competition) =>
      limit(async () => {
        const url = `${BASE_URL}/Competitions/Details/${competition.id}`;
        const detail = parseGnlCompetitionDetail(await fetchPage(url), competition.jobTitle);

        return {
          externalId: String(competition.id),
          title: detail.title,
          location: formatLocation(competition),
          department: formatDepartment(competition),
          descriptionHtml: detail.descriptionHtml,
          descriptionText: detail.descriptionText,
          url,
          postedAt: detail.postedAt,
          updatedAt: parseExternalUpdatedAt(competition.statusChangeDate),
        } satisfies FetchedJob;
      }),
    ),
  );
}
