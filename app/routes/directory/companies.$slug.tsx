import { TECHNL_DIRECTORY_URL } from "~/lib/technl";
import type { Route } from "./+types/companies.$slug";
import { Link, useLoaderData } from "react-router";
import { useMemo, useState } from "react";
import { getCompanyBySlug } from "~/lib/companies.server";
import { loadDirectoryCommonData } from "~/lib/directory-page.server";
import { getTechnologiesForContent } from "~/lib/technologies.server";
import {
  getTechnologyEvidenceGroupKey,
  normalizeTechnologyEvidenceSourceLabel,
} from "~/lib/technology-evidence";
import { categoryLabels, type TechnologyCategory } from "~/lib/technology-categories";
import { getActiveJobsForCompany } from "~/lib/job-importers/sync.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";
import { ReferencedBy } from "~/components/ReferencedBy";
import { CompanyEvidenceDialog } from "~/components/directory/CompanyEvidenceDialog";
import { buildSeoMeta, stripMarkdown } from "~/lib/seo";

function formatMonthYear(value: string): string {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const monthIndex = Number(dateOnlyMatch[2]) - 1;
    return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getProvenanceSourceDisplayLabel(sourceType: "job_posting" | "survey" | "manual"): string {
  const trimmed = normalizeTechnologyEvidenceSourceLabel(sourceType);
  if (trimmed) return trimmed;

  switch (sourceType) {
    case "job_posting":
      return "Job Postings";
    case "survey":
      return "Survey";
    case "manual":
      return "Manual";
    default:
      return "Source";
  }
}

export function meta({ loaderData: data }: Route.MetaArgs) {
  const company = data?.company;
  const name = company?.name ?? "Company";
  const description = company?.description
    ? stripMarkdown(company.description)
    : `${name} is a tech company in St. John's, NL.`;
  return buildSeoMeta({
    title: name,
    description,
    url: `/directory/companies/${company?.slug ?? ""}`,
  });
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const company = await getCompanyBySlug(params.slug);
  if (!company) {
    throw new Response("Company not found", { status: 404 });
  }

  const [common, technologiesWithAssignments, activeJobs] = await Promise.all([
    loadDirectoryCommonData({
      request,
      contentType: "company",
      contentId: company.id,
      description: company.description,
      commentsSection: "companies",
    }),
    getTechnologiesForContent("company", company.id),
    getActiveJobsForCompany(company.id),
  ]);

  // Group technologies by category for display
  const techByCategory = new Map<TechnologyCategory, typeof technologiesWithAssignments>();
  for (const item of technologiesWithAssignments) {
    const cat = item.technology.category;
    if (!techByCategory.has(cat)) {
      techByCategory.set(cat, []);
    }
    techByCategory.get(cat)!.push(item);
  }

  const provenanceMap = new Map<
    string,
    {
      sourceType: "job_posting" | "survey" | "manual";
      source: string | null;
      sourceUrl: string | null;
      lastVerified: string | null;
      count: number;
      jobCount: number;
      evidence: Array<{
        technology: string;
        jobId: number | null;
        jobTitle: string | null;
        jobStatus: string | null;
        jobUrl: string | null;
        excerptText: string | null;
      }>;
    }
  >();
  for (const item of technologiesWithAssignments) {
    for (const evidence of item.evidence) {
      const normalizedSourceLabel = normalizeTechnologyEvidenceSourceLabel(evidence.sourceType);
      const key = getTechnologyEvidenceGroupKey(
        evidence.sourceType,
        evidence.sourceUrl,
        evidence.lastVerified,
      );
      const existing = provenanceMap.get(key);
      if (existing) {
        existing.count += 1;
        if (evidence.jobId) {
          existing.jobCount += 1;
        }
        if (!existing.sourceUrl && evidence.sourceUrl) {
          existing.sourceUrl = evidence.sourceUrl;
        }
        if (!existing.lastVerified && evidence.lastVerified) {
          existing.lastVerified = evidence.lastVerified;
        }
        existing.evidence.push({
          technology: item.technology.name,
          jobId: evidence.jobId,
          jobTitle: evidence.jobTitle,
          jobStatus: evidence.jobStatus,
          jobUrl: evidence.jobUrl,
          excerptText: evidence.excerptText,
        });
        continue;
      }

      provenanceMap.set(key, {
        sourceType: evidence.sourceType,
        source: normalizedSourceLabel,
        sourceUrl: evidence.sourceUrl,
        lastVerified: evidence.lastVerified,
        count: 1,
        jobCount: evidence.jobId ? 1 : 0,
        evidence: [
          {
            technology: item.technology.name,
            jobId: evidence.jobId,
            jobTitle: evidence.jobTitle,
            jobStatus: evidence.jobStatus,
            jobUrl: evidence.jobUrl,
            excerptText: evidence.excerptText,
          },
        ],
      });
    }
  }

  const provenanceEntries = Array.from(provenanceMap.values()).sort((a, b) => {
    const sourceA = a.source ?? a.sourceUrl ?? "";
    const sourceB = b.source ?? b.sourceUrl ?? "";
    return sourceA.localeCompare(sourceB);
  });

  return {
    company,
    ...common,
    techByCategory: Array.from(techByCategory.entries()),
    provenanceEntries,
    activeJobs,
  };
}

export default function CompanyDetail() {
  const {
    company,
    resolvedRefs,
    backlinks,
    comments,
    turnstileSiteKey,
    isAdmin,
    commentsEnabled,
    techByCategory,
    provenanceEntries,
    activeJobs,
  } = useLoaderData<typeof loader>();
  const [showEvidence, setShowEvidence] = useState(false);
  const technicalJobs = activeJobs.filter((job) => job.isTechnical);
  const nonTechnicalJobs = activeJobs.filter((job) => !job.isTechnical);
  const evidenceJobs = useMemo(() => {
    const descriptionByKey = new Map<string, string>();
    for (const job of activeJobs) {
      if (!job.url || !job.descriptionText) continue;
      const key = `${job.title}::${job.url}`.toLowerCase();
      descriptionByKey.set(key, job.descriptionText);
    }

    return Array.from(
      provenanceEntries
        .flatMap((entry) => entry.evidence)
        .filter((evidence) => evidence.jobTitle && evidence.jobUrl)
        .reduce(
          (acc, evidence) => {
            const key = `${evidence.jobTitle}::${evidence.jobUrl}`.toLowerCase();
            const existing = acc.get(key);
            if (existing) {
              if (
                evidence.excerptText &&
                evidence.excerptText.trim().length > 0 &&
                !existing.excerpts.includes(evidence.excerptText)
              ) {
                existing.excerpts.push(evidence.excerptText);
              }
              return acc;
            }

            acc.set(key, {
              title: evidence.jobTitle as string,
              url: evidence.jobUrl as string,
              status: evidence.jobStatus,
              fullText: descriptionByKey.get(key) ?? null,
              excerpts:
                evidence.excerptText && evidence.excerptText.trim().length > 0
                  ? [evidence.excerptText]
                  : [],
            });
            return acc;
          },
          new Map<
            string,
            {
              title: string;
              url: string;
              status: string | null;
              fullText: string | null;
              excerpts: string[];
            }
          >(),
        )
        .values(),
    );
  }, [provenanceEntries, activeJobs]);

  return (
    <div className="max-w-4xl mx-auto p-pad-4 py-pad-8">
      {!company.visible && (
        <div className="mb-6 p-pad-4 bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-gap-2">
            <svg
              className="w-5 h-5 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
            <span className="text-amber-800 font-medium">
              This page is hidden from public listings
            </span>
          </div>
          {isAdmin && (
            <Link
              to={`/manage/companies/${company.id}`}
              className="text-sm px-pad-3 py-pad-1 bg-amber-200 text-amber-800 hover:bg-amber-300 transition-colors"
            >
              Edit visibility
            </Link>
          )}
        </div>
      )}
      <article className="flex flex-col gap-gap-6">
        {company.coverImage && (
          <div className="aspect-video relative overflow-hidden">
            <img
              src={`/images/${company.coverImage}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start gap-gap-4">
          {company.logo ? (
            <div className="w-20 h-20 relative overflow-hidden flex-shrink-0">
              <img
                src={`/images/${company.logo}`}
                alt={`${company.name} logo`}
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-20 h-20 bg-tint flex items-center justify-center flex-shrink-0">
              <span className="text-3xl text-subtle">{company.name.charAt(0)}</span>
            </div>
          )}
          <div className="flex flex-col gap-gap-1 flex-1">
            <div className="flex items-center gap-gap-2">
              <h1 className="text-3xl font-bold text-heading">{company.name}</h1>
              {isAdmin && (
                <Link
                  to={`/manage/companies/${company.id}`}
                  className="p-pad-1-5 text-subtle hover:text-body hover:bg-tint transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </Link>
              )}
            </div>
            {company.location && <p className="text-muted">{company.location}</p>}
            {company.founded && <p className="text-sm text-subtle">Founded {company.founded}</p>}
          </div>
        </div>

        <div className="prose">
          <RichMarkdown content={company.description} resolvedRefs={resolvedRefs} />
        </div>

        {(company.careersUrl ||
          company.website ||
          company.wikipedia ||
          company.linkedin ||
          company.github ||
          company.technl ||
          company.genesis ||
          company.bounce) && (
          <div className="flex flex-wrap gap-gap-3">
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-gap-2 px-pad-4 py-pad-2 bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
              >
                Visit Website
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
            {company.careersUrl && (
              <a
                href={company.careersUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-gap-2 px-pad-4 py-pad-2 bg-tint text-heading font-medium hover:bg-harbour-200 transition-colors"
              >
                Visit Careers Page
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
            {company.wikipedia && (
              <a
                href={company.wikipedia}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-gap-2 px-pad-4 py-pad-2 bg-tint text-heading font-medium hover:bg-harbour-200 transition-colors"
              >
                Wikipedia
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
            {company.linkedin && (
              <a
                href={company.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-gap-2 px-pad-4 py-pad-2 bg-tint text-heading font-medium hover:bg-harbour-200 transition-colors"
              >
                LinkedIn
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
            {company.github && (
              <a
                href={company.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-gap-2 px-pad-4 py-pad-2 bg-tint text-heading font-medium hover:bg-harbour-200 transition-colors"
              >
                GitHub
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
            {company.technl && (
              <a
                href={TECHNL_DIRECTORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-gap-2 px-pad-4 py-pad-2 bg-tint text-heading font-medium hover:bg-harbour-200 transition-colors"
              >
                TechNL Directory
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
            {company.genesis && (
              <a
                href="https://www.genesiscentre.ca/portfolio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-gap-2 px-pad-4 py-pad-2 bg-tint text-heading font-medium hover:bg-harbour-200 transition-colors"
              >
                Genesis Centre
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
            {company.bounce && (
              <a
                href="https://bounceinnovation.ca/companies/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-gap-2 px-pad-4 py-pad-2 bg-tint text-heading font-medium hover:bg-harbour-200 transition-colors"
              >
                Bounce Health Innovation
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
          </div>
        )}

        {techByCategory.length > 0 && (
          <div className="border-t border-line pt-pad-6">
            <h2 className="text-lg font-semibold text-heading mb-3">Technologies</h2>
            <div className="flex flex-wrap gap-gap-1-5 items-center">
              {techByCategory.map(([category, items]) => (
                <span
                  key={category}
                  className="inline-flex items-center gap-gap-1 px-pad-2 py-pad-1 bg-soft border border-line text-xs"
                >
                  <span className="text-muted font-medium">
                    {categoryLabels[category as TechnologyCategory]}:
                  </span>
                  {items.map((item, idx) => (
                    <span key={item.technology.id} className="inline-flex items-center">
                      <Link
                        to={`/directory/technologies/${item.technology.slug}`}
                        className="text-heading hover:text-harbour-900 hover:underline"
                      >
                        {item.technology.name}
                      </Link>
                      {idx < items.length - 1 && <span className="text-harbour-300 mx-0.5">/</span>}
                    </span>
                  ))}
                </span>
              ))}
            </div>
            {provenanceEntries.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-gap-2 text-xs">
                <span className="text-muted">via</span>
                {provenanceEntries.map((entry, index) => {
                  const isLast = index === provenanceEntries.length - 1;
                  const isSecondLast = index === provenanceEntries.length - 2;
                  const separator =
                    provenanceEntries.length <= 1 || isLast ? "" : isSecondLast ? ", &" : ",";
                  const displaySource = getProvenanceSourceDisplayLabel(entry.sourceType);
                  const label = `${displaySource}${entry.lastVerified ? ` (${formatMonthYear(entry.lastVerified)})` : ""}`;
                  const isGetBuilding = displaySource.includes("Get Building");

                  if (isGetBuilding && entry.sourceUrl) {
                    return (
                      <span key={index}>
                        <a
                          href={entry.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted hover:text-heading hover:underline"
                        >
                          {label}
                        </a>
                        {separator && <span>{separator}</span>}
                      </span>
                    );
                  }

                  return (
                    <span key={index}>
                      <button
                        type="button"
                        onClick={() => setShowEvidence(true)}
                        className="text-muted hover:text-heading hover:underline"
                      >
                        {label}
                      </button>
                      {separator && <span>{separator}</span>}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <CompanyEvidenceDialog
          open={showEvidence}
          onOpenChange={setShowEvidence}
          jobs={evidenceJobs}
        />

        {activeJobs.length > 0 && (
          <div className="border-t border-line pt-pad-6 flex flex-col gap-gap-5">
            <h2 className="text-lg font-semibold text-heading">
              Open Positions ({activeJobs.length})
            </h2>

            {technicalJobs.length > 0 && (
              <div className="flex flex-col gap-gap-2">
                <h3 className="text-sm font-semibold text-heading">
                  Technical ({technicalJobs.length})
                </h3>
                <div className="flex flex-col gap-gap-2">
                  {technicalJobs.map((job) => (
                    <a
                      key={job.id}
                      href={job.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-pad-3 bg-surface hover:bg-soft border border-line transition-colors group"
                    >
                      <div className="flex flex-col gap-gap-0-5">
                        <span className="font-medium text-heading group-hover:text-harbour-900">
                          {job.title}
                        </span>
                        <div className="flex items-center gap-gap-2 text-sm text-muted">
                          {job.location && <span>{job.location}</span>}
                          {job.department && (
                            <>
                              {job.location && <span className="text-harbour-300">|</span>}
                              <span>{job.department}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-gap-2">
                        {job.workplaceType && (
                          <span
                            className={`px-pad-2 py-pad-0-5 text-xs font-medium ${
                              job.workplaceType === "remote"
                                ? "bg-purple-100 text-purple-700"
                                : job.workplaceType === "hybrid"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {job.workplaceType}
                          </span>
                        )}
                        <svg
                          className="w-4 h-4 text-subtle group-hover:text-body"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {nonTechnicalJobs.length > 0 && (
              <div className="flex flex-col gap-gap-2">
                <h3 className="text-sm font-semibold text-heading">
                  Non-technical ({nonTechnicalJobs.length})
                </h3>
                <div className="flex flex-col gap-gap-2">
                  {nonTechnicalJobs.map((job) => (
                    <a
                      key={job.id}
                      href={job.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-pad-3 bg-surface hover:bg-soft border border-line transition-colors group"
                    >
                      <div className="flex flex-col gap-gap-0-5">
                        <span className="font-medium text-heading group-hover:text-harbour-900">
                          {job.title}
                        </span>
                        <div className="flex items-center gap-gap-2 text-sm text-muted">
                          {job.location && <span>{job.location}</span>}
                          {job.department && (
                            <>
                              {job.location && <span className="text-harbour-300">|</span>}
                              <span>{job.department}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-gap-2">
                        {job.workplaceType && (
                          <span
                            className={`px-pad-2 py-pad-0-5 text-xs font-medium ${
                              job.workplaceType === "remote"
                                ? "bg-purple-100 text-purple-700"
                                : job.workplaceType === "hybrid"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {job.workplaceType}
                          </span>
                        )}
                        <svg
                          className="w-4 h-4 text-subtle group-hover:text-body"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <ReferencedBy backlinks={backlinks} />

        {commentsEnabled && (
          <CommentSection
            contentType="company"
            contentId={company.id}
            comments={comments}
            turnstileSiteKey={turnstileSiteKey}
            isAdmin={isAdmin}
          />
        )}
      </article>
    </div>
  );
}
