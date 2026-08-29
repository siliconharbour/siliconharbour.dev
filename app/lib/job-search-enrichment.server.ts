import { db } from "~/db";
import { companies, jobImportSources, jobs } from "~/db/schema";
import type { IndeedSearchResult, LinkedInSearchResult } from "./job-search.server";

type SearchResult = IndeedSearchResult | LinkedInSearchResult;
type MatchConfidence = "exact" | "normalized";
type DuplicateConfidence = "exact_url" | "company_title";

export interface JobSearchEnrichment {
  match: {
    companyId: number | null;
    companySlug: string | null;
    companyVisible: boolean | null;
    companyConfidence: MatchConfidence | null;
    existingJobId: number | null;
    existingJobStatus: string | null;
    duplicateConfidence: DuplicateConfidence | null;
    likelyDuplicate: boolean;
    companyHasJobSource: boolean;
    jobSources: Array<{
      id: number;
      sourceType: string;
      sourceIdentifier: string;
      sourceUrl: string | null;
    }>;
  };
  discoveredSource: {
    sourceType: string;
    sourceIdentifier: string | null;
    sourceUrl: string;
    confidence: "high" | "medium";
  } | null;
}

export type EnrichedIndeedSearchResult = IndeedSearchResult & JobSearchEnrichment;
export type EnrichedLinkedInSearchResult = LinkedInSearchResult & JobSearchEnrichment;

interface EnrichmentRows {
  companies: Array<{ id: number; name: string; slug: string; visible: boolean }>;
  jobs: Array<{
    id: number;
    companyId: number | null;
    title: string;
    url: string | null;
    status: string;
  }>;
  sources: Array<{
    id: number;
    companyId: number;
    sourceType: string;
    sourceIdentifier: string;
    sourceUrl: string | null;
  }>;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCompany(value: string): string {
  return normalize(value)
    .replace(/\b(?:inc|incorporated|ltd|limited|corp|corporation|company|co)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAts(urlValue: string | null | undefined): JobSearchEnrichment["discoveredSource"] {
  if (!urlValue) return null;

  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  const result = (sourceType: string, sourceIdentifier: string | null, confidence: "high" | "medium" = "high") => ({
    sourceType,
    sourceIdentifier,
    sourceUrl: url.toString(),
    confidence,
  });

  if (host.endsWith(".bamboohr.com")) return result("bamboohr", host.split(".")[0]);
  if (host === "workforcenow.adp.com") {
    const clientId = url.searchParams.get("cid");
    const careerCenterId = url.searchParams.get("ccId");
    const locale = url.searchParams.get("lang");
    const identifier =
      clientId && careerCenterId
        ? [clientId, careerCenterId, locale].filter(Boolean).join(":")
        : null;
    return result("adp", identifier);
  }
  if (host === "jobs.ashbyhq.com") return result("ashby", parts[0] ?? null);
  if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(host)) {
    return result("greenhouse", parts[0] ?? null);
  }
  if (host === "jobs.lever.co") return result("lever", parts[0] ?? null);
  if (host === "secure.collage.co" && parts[0] === "jobs") {
    return result("collage", parts[1] ?? null);
  }
  if (host === "ats.rippling.com") return result("rippling", parts[0] ?? null);
  if (host === "apply.workable.com") return result("workable", parts[0] ?? null);
  if (host.includes("myworkdayjobs.com")) return result("workday", null, "medium");
  if (host.includes("icims.com")) return result("icims", host.split(".")[0], "medium");
  if (host.includes("oraclecloud.com")) return result("oracle-hcm", null, "medium");
  if (host.includes("dayforcehcm.com")) return result("dayforce", null, "medium");
  if (host === "www.kyrix.ai" && parts[0] === "j") return result("kyrix", parts[1] ?? null);
  if (host.includes("successfactors") || /\/job\/[^/]+\/\d+\/?$/i.test(url.pathname)) {
    return result("successfactors", host, "medium");
  }
  return null;
}

export function enrichJobSearchResultsFromRows<T extends SearchResult>(
  results: T[],
  rows: EnrichmentRows,
): Array<T & JobSearchEnrichment> {
  const sourcesByCompany = new Map<number, EnrichmentRows["sources"]>();
  for (const source of rows.sources) {
    const current = sourcesByCompany.get(source.companyId) ?? [];
    current.push(source);
    sourcesByCompany.set(source.companyId, current);
  }

  return results.map((result) => {
    const companyName = result.companyName?.trim() ?? "";
    const exactCompany = rows.companies.find(
      (company) => normalize(company.name) === normalize(companyName),
    );
    const company =
      exactCompany ??
      rows.companies.find(
        (candidate) =>
          normalizeCompany(companyName).length > 2 &&
          normalizeCompany(candidate.name) === normalizeCompany(companyName),
      );
    const directUrl = "directUrl" in result ? result.directUrl : null;
    const candidateUrls = new Set([result.url, directUrl].filter(Boolean));
    const urlMatch = rows.jobs.find((job) => job.url && candidateUrls.has(job.url));
    const titleMatch = company
      ? rows.jobs.find(
          (job) => job.companyId === company.id && normalize(job.title) === normalize(result.title),
        )
      : undefined;
    const matchingJob = urlMatch ?? titleMatch;
    const jobSources = company ? (sourcesByCompany.get(company.id) ?? []) : [];

    return {
      ...result,
      match: {
        companyId: company?.id ?? null,
        companySlug: company?.slug ?? null,
        companyVisible: company?.visible ?? null,
        companyConfidence: company ? (exactCompany ? "exact" : "normalized") : null,
        existingJobId: matchingJob?.id ?? null,
        existingJobStatus: matchingJob?.status ?? null,
        duplicateConfidence: urlMatch ? "exact_url" : titleMatch ? "company_title" : null,
        likelyDuplicate: Boolean(matchingJob),
        companyHasJobSource: jobSources.length > 0,
        jobSources: jobSources.map((source) => ({
          id: source.id,
          sourceType: source.sourceType,
          sourceIdentifier: source.sourceIdentifier,
          sourceUrl: source.sourceUrl,
        })),
      },
      discoveredSource: detectAts(directUrl),
    };
  });
}

export async function enrichJobSearchResults<T extends SearchResult>(
  results: T[],
): Promise<Array<T & JobSearchEnrichment>> {
  const [companyRows, jobRows, sourceRows] = await Promise.all([
    db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        visible: companies.visible,
      })
      .from(companies),
    db
      .select({
        id: jobs.id,
        companyId: jobs.companyId,
        title: jobs.title,
        url: jobs.url,
        status: jobs.status,
      })
      .from(jobs),
    db
      .select({
        id: jobImportSources.id,
        companyId: jobImportSources.companyId,
        sourceType: jobImportSources.sourceType,
        sourceIdentifier: jobImportSources.sourceIdentifier,
        sourceUrl: jobImportSources.sourceUrl,
      })
      .from(jobImportSources),
  ]);
  return enrichJobSearchResultsFromRows(results, {
    companies: companyRows,
    jobs: jobRows,
    sources: sourceRows,
  });
}

export const __testables = { detectAts, normalize, normalizeCompany };
