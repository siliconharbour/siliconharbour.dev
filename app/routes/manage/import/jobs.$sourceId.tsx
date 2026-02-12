import type { Route } from "./+types/jobs.$sourceId";
import { Link, useLoaderData, useFetcher, redirect } from "react-router";
import type { ReactNode } from "react";
import { requireAuth } from "~/lib/session.server";
import type { FetchedJob } from "~/lib/job-importers/types";
import { getImportSourceWithStats, syncJobs, syncJobsFromFetched, deleteImportSource, hideImportedJob, unhideImportedJob, markJobNonTechnical, markJobTechnical, approveJob, approveJobAsNonTechnical } from "~/lib/job-importers/sync.server";
import { getCompanyById } from "~/lib/companies.server";
import { sourceTypeLabels } from "~/lib/job-importers/types";
import { extractTechnologiesForSource, getTechnologyPreviewForSource } from "~/lib/job-importers/tech-extractor.server";
import { applyTechnologyEvidenceFromJobMentions } from "~/lib/technologies.server";
import { categoryLabels, type TechnologyCategory } from "~/lib/technology-categories";

const VERAFIN_SOURCE_ID = 3;
const VERAFIN_SOURCE_IDENTIFIER = "nasdaq:Global_External_Site:verafin";

function defaultLastVerifiedMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isVerafinManualSource(source: { id: number; sourceType: string; sourceIdentifier: string }): boolean {
  return (
    source.id === VERAFIN_SOURCE_ID &&
    source.sourceType === "workday" &&
    source.sourceIdentifier === VERAFIN_SOURCE_IDENTIFIER
  );
}

function parseSelectedTechnologyIds(formData: FormData): number[] {
  return formData
    .getAll("selectedTechnologyIds")
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function sanitizeManualFetchedJob(input: unknown): FetchedJob | null {
  if (!input || typeof input !== "object") return null;

  const value = input as Record<string, unknown>;
  const externalId = typeof value.externalId === "string" ? value.externalId.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!externalId || !title) return null;

  const postedAt =
    typeof value.postedAt === "string" && value.postedAt.trim()
      ? new Date(value.postedAt)
      : undefined;

  return {
    externalId,
    title,
    location: typeof value.location === "string" ? value.location.trim() || undefined : undefined,
    department: typeof value.department === "string" ? value.department.trim() || undefined : undefined,
    descriptionHtml:
      typeof value.descriptionHtml === "string" ? value.descriptionHtml.trim() || undefined : undefined,
    descriptionText:
      typeof value.descriptionText === "string" ? value.descriptionText.trim() || undefined : undefined,
    url: typeof value.url === "string" ? value.url.trim() || undefined : undefined,
    workplaceType:
      value.workplaceType === "remote" || value.workplaceType === "onsite" || value.workplaceType === "hybrid"
        ? value.workplaceType
        : undefined,
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : undefined,
    updatedAt: undefined,
  };
}

function parseManualJobsJson(rawJson: string): { jobs?: FetchedJob[]; error?: string } {
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).jobs)
        ? ((parsed as Record<string, unknown>).jobs as unknown[])
        : null;

    if (!list) {
      return { error: "Manual JSON must be an array of jobs or an object with a jobs array." };
    }

    const jobs = list.map(sanitizeManualFetchedJob).filter(Boolean) as FetchedJob[];
    if (jobs.length === 0) {
      return { error: "No valid jobs found. Each job needs at least externalId and title." };
    }

    return { jobs };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid JSON payload." };
  }
}

const VERAFIN_BROWSER_SCRIPT = String.raw`(async () => {
  const q = new URL(location.href).searchParams.get("q") ?? "";
  const m = location.pathname.match(/^\/([^/]+)(?:\/|$)/);
  if (!m) throw new Error("Could not infer Workday site from URL path.");

  const site = m[1];
  const company = location.hostname.split(".")[0];
  const base = location.origin;
  const apiBase = base + "/wday/cxs/" + company + "/" + site;
  const headers = { "Accept": "application/json", "Content-Type": "application/json" };

  const list = [];
  let offset = 0;
  const limit = 20;

  while (true) {
    const res = await fetch(apiBase + "/jobs", {
      method: "POST",
      headers,
      body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: q }),
      credentials: "include",
    });
    if (!res.ok) throw new Error("Workday list fetch failed: " + res.status + " " + res.statusText);

    const data = await res.json();
    const postings = Array.isArray(data?.jobPostings) ? data.jobPostings : [];
    if (postings.length === 0) break;
    list.push(...postings);
    offset += postings.length;
    if (offset >= (Number(data?.total) || 0)) break;
  }

  const jobs = [];
  for (const posting of list) {
    const fallbackId = String(posting.externalPath ?? posting.title ?? "").trim();
    const fromPath = String(posting.externalPath ?? "").match(/_([A-Z0-9-]+(?:-\d+)?)$/i);
    const defaultJob = {
      externalId: fromPath?.[1] || fallbackId,
      title: String(posting.title ?? "").trim(),
      location: String(posting.locationsText ?? "").trim() || undefined,
      url: base + "/" + site + String(posting.externalPath ?? ""),
    };

    try {
      const dRes = await fetch(apiBase + String(posting.externalPath ?? ""), {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (!dRes.ok) {
        jobs.push(defaultJob);
        continue;
      }

      const detail = await dRes.json();
      const info = detail?.jobPostingInfo ?? {};
      jobs.push({
        externalId: String(info.jobReqId || info.id || defaultJob.externalId).trim(),
        title: String(info.title || defaultJob.title).trim(),
        location: info.location ? String(info.location).trim() : defaultJob.location,
        descriptionHtml: typeof info.jobDescription === "string" ? info.jobDescription : undefined,
        descriptionText: undefined,
        url: String(info.externalUrl || defaultJob.url).trim(),
        postedAt: typeof info.startDate === "string" ? info.startDate : undefined,
      });
    } catch {
      jobs.push(defaultJob);
    }
  }

  const output = JSON.stringify(jobs, null, 2);
  console.log(output);
  if (typeof copy === "function") copy(output);
})();`;

export function meta({ data }: Route.MetaArgs) {
  const companyName = data?.company?.name || "Source";
  return [{ title: `${companyName} Jobs - Import - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);
  
  const sourceId = Number(params.sourceId);
  if (!sourceId) {
    throw new Response("Not Found", { status: 404 });
  }
  
  const source = await getImportSourceWithStats(sourceId);
  if (!source) {
    throw new Response("Not Found", { status: 404 });
  }
  
  const company = await getCompanyById(source.companyId);
  
  return { source, company, isVerafinManualMode: isVerafinManualSource(source) };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);
  
  const sourceId = Number(params.sourceId);
  const source = await getImportSourceWithStats(sourceId);
  if (!source) {
    return { success: false, error: "Source not found" };
  }
  const company = await getCompanyById(source.companyId);
  const formData = await request.formData();
  const intent = formData.get("intent");
  
  if (intent === "sync") {
    const result = await syncJobs(sourceId);
    return { intent: "sync", ...result };
  }

  if (intent === "manual-sync") {
    if (!source || !isVerafinManualSource(source)) {
      return { intent: "manual-sync", success: false, error: "Manual ingestion is not enabled for this source." };
    }

    const rawJson = String(formData.get("manualJobsJson") || "").trim();
    if (!rawJson) {
      return { intent: "manual-sync", success: false, error: "Paste the JSON from the browser console output." };
    }

    const parsed = parseManualJobsJson(rawJson);
    if (!parsed.jobs) {
      return { intent: "manual-sync", success: false, error: parsed.error || "Invalid manual JSON." };
    }

    const result = await syncJobsFromFetched(sourceId, parsed.jobs);
    return { intent: "manual-sync", parsedCount: parsed.jobs.length, ...result };
  }

  if (intent === "extract-tech-preview") {
    const extraction = await extractTechnologiesForSource(sourceId);
    const preview = await getTechnologyPreviewForSource(sourceId);

    return {
      intent: "extract-tech-preview",
      success: true,
      extraction,
      preview,
      defaults: {
        sourceType: "job_posting",
        sourceLabel: "Imported Job Postings",
        sourceUrl: source.sourceUrl || company?.careersUrl || company?.website || null,
        lastVerified: defaultLastVerifiedMonth(),
      },
    };
  }

  if (intent === "apply-tech-preview") {
    const selectedTechnologyIds = parseSelectedTechnologyIds(formData);
    if (selectedTechnologyIds.length === 0) {
      return { intent: "apply-tech-preview", success: false, error: "Select at least one technology to apply." };
    }

    const sourceTypeRaw = String(formData.get("sourceType") || "job_posting");
    const sourceType = sourceTypeRaw === "job_posting" || sourceTypeRaw === "survey" || sourceTypeRaw === "manual"
      ? sourceTypeRaw
      : "job_posting";
    const sourceLabel = String(formData.get("sourceLabel") || "").trim() || null;
    const sourceUrl = String(formData.get("sourceUrl") || "").trim() || null;
    const lastVerified = String(formData.get("lastVerified") || "").trim() || defaultLastVerifiedMonth();

    const applyResult = await applyTechnologyEvidenceFromJobMentions({
      companyId: source.companyId,
      sourceId,
      selectedTechnologyIds,
      sourceType,
      sourceLabel,
      sourceUrl,
      lastVerified,
    });

    const preview = await getTechnologyPreviewForSource(sourceId);
    return {
      intent: "apply-tech-preview",
      success: true,
      applyResult,
      preview,
      defaults: {
        sourceType,
        sourceLabel,
        sourceUrl,
        lastVerified,
      },
    };
  }
  
  if (intent === "delete") {
    await deleteImportSource(sourceId);
    return redirect("/manage/import/jobs");
  }
  
  if (intent === "hide") {
    const jobId = Number(formData.get("jobId"));
    if (jobId) {
      await hideImportedJob(jobId);
      return { intent: "hide", jobId, success: true };
    }
  }
  
  if (intent === "unhide") {
    const jobId = Number(formData.get("jobId"));
    if (jobId) {
      await unhideImportedJob(jobId);
      return { intent: "unhide", jobId, success: true };
    }
  }
  
  if (intent === "mark-non-technical") {
    const jobId = Number(formData.get("jobId"));
    if (jobId) {
      await markJobNonTechnical(jobId);
      return { intent: "mark-non-technical", jobId, success: true };
    }
  }
  
  if (intent === "mark-technical") {
    const jobId = Number(formData.get("jobId"));
    if (jobId) {
      await markJobTechnical(jobId);
      return { intent: "mark-technical", jobId, success: true };
    }
  }
  
  if (intent === "approve") {
    const jobId = Number(formData.get("jobId"));
    if (jobId) {
      await approveJob(jobId);
      return { intent: "approve", jobId, success: true };
    }
  }
  
  if (intent === "approve-non-technical") {
    const jobId = Number(formData.get("jobId"));
    if (jobId) {
      await approveJobAsNonTechnical(jobId);
      return { intent: "approve-non-technical", jobId, success: true };
    }
  }
  
  return { success: false, error: "Unknown action" };
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "Never";
  return new Date(date).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    pending_review: "bg-blue-100 text-blue-700",
    removed: "bg-slate-100 text-slate-600",
    filled: "bg-blue-100 text-blue-700",
    expired: "bg-amber-100 text-amber-700",
    hidden: "bg-amber-100 text-amber-700",
  };
  
  const labels: Record<string, string> = {
    pending_review: "pending review",
  };
  
  return (
    <span className={`text-xs px-1.5 py-0.5 ${colors[status] || "bg-harbour-100 text-harbour-600"}`}>
      {labels[status] || status}
    </span>
  );
}

function WorkplaceBadge({ type }: { type: string | null }) {
  if (!type) return null;
  
  const colors: Record<string, string> = {
    remote: "bg-purple-100 text-purple-700",
    hybrid: "bg-orange-100 text-orange-700",
    onsite: "bg-blue-100 text-blue-700",
  };
  
  return (
    <span className={`text-xs px-1.5 py-0.5 ${colors[type] || "bg-harbour-100 text-harbour-600"}`}>
      {type}
    </span>
  );
}

function JobTitleWithDescription({
  title,
  url,
  descriptionText,
  badge,
}: {
  title: string;
  url: string | null;
  descriptionText: string | null;
  badge?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-harbour-600 hover:underline">
            {title}
          </a>
        ) : (
          <span className="text-harbour-700">{title}</span>
        )}
        {badge}
      </div>
      {descriptionText && descriptionText.trim().length > 0 && (
        <details className="w-full">
          <summary className="cursor-pointer text-xs text-harbour-500 hover:text-harbour-700">
            View full posting text
          </summary>
          <pre className="mt-2 p-2 text-xs text-harbour-600 bg-harbour-50 border border-harbour-200 whitespace-pre-wrap break-words font-mono">
            {descriptionText}
          </pre>
        </details>
      )}
    </div>
  );
}

export default function ViewJobImportSource() {
  const { source, company, isVerafinManualMode } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const techFetcher = useFetcher<typeof action>();
  
  const isLoading = fetcher.state !== "idle";
  const isTechLoading = techFetcher.state !== "idle";
  const careersPageUrl = source.sourceUrl || company?.careersUrl || company?.website || null;
  const companyDetailsPath = company?.slug ? `/directory/companies/${company.slug}` : null;
  const syncResult =
    fetcher.data &&
    "intent" in fetcher.data &&
    (fetcher.data.intent === "sync" || fetcher.data.intent === "manual-sync")
      ? fetcher.data
      : null;
  
  // Separate jobs by status
  const pendingReviewJobs = source.jobs.filter(j => j.status === "pending_review");
  const activeJobs = source.jobs.filter(j => j.status === "active");
  const hiddenJobs = source.jobs.filter(j => j.status === "hidden");
  const removedJobs = source.jobs.filter(j => j.status !== "active" && j.status !== "hidden" && j.status !== "pending_review");
  const techResult = techFetcher.data && "intent" in techFetcher.data && (
    techFetcher.data.intent === "extract-tech-preview" || techFetcher.data.intent === "apply-tech-preview"
  ) ? techFetcher.data : null;
  const techPreview = techResult && "preview" in techResult ? techResult.preview : null;
  const techDefaults = techResult && "defaults" in techResult
    ? techResult.defaults
    : {
        sourceType: "job_posting",
        sourceLabel: "Imported Job Postings",
        sourceUrl: source.sourceUrl || company?.careersUrl || company?.website || "",
        lastVerified: defaultLastVerifiedMonth(),
      };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Link
            to="/manage/import/jobs"
            className="text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back
          </Link>
          <h1 className="text-2xl font-semibold text-harbour-700">
            {company?.name || "Unknown Company"} - Job Import
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {careersPageUrl && (
              <a
                href={careersPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 bg-harbour-100 hover:bg-harbour-200 text-harbour-700 text-sm font-medium transition-colors"
              >
                Careers Page
              </a>
            )}
            {companyDetailsPath && (
              <Link
                to={companyDetailsPath}
                className="px-3 py-2 bg-harbour-600 hover:bg-harbour-700 text-white text-sm font-medium transition-colors"
              >
                Company Page
              </Link>
            )}
          </div>
        </div>

        {syncResult && "added" in syncResult && (
          <div className={`p-4 ${syncResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
            {syncResult.success ? (
              <div>
                <p className="font-medium text-green-700">Sync completed</p>
                <p className="text-sm text-green-600">
                  Added: {syncResult.added}, Updated: {syncResult.updated}, 
                  Removed: {syncResult.removed}, Reactivated: {syncResult.reactivated}
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-red-700">Sync failed</p>
                <p className="text-sm text-red-600">{syncResult.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Source details */}
        <div className="bg-white border border-harbour-200 p-6">
          <h2 className="text-lg font-semibold text-harbour-700 mb-4">Source Configuration</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-harbour-500">Source Type</dt>
              <dd className="font-medium text-harbour-700">{sourceTypeLabels[source.sourceType as keyof typeof sourceTypeLabels] || source.sourceType}</dd>
            </div>
            <div>
              <dt className="text-harbour-500">Identifier</dt>
              <dd className="font-mono text-harbour-600">{source.sourceIdentifier}</dd>
            </div>
            <div>
              <dt className="text-harbour-500">Last Fetched</dt>
              <dd className="text-harbour-600">{formatDate(source.lastFetchedAt)}</dd>
            </div>
            <div>
              <dt className="text-harbour-500">Fetch Status</dt>
              <dd>
                {source.fetchStatus ? (
                  <span className={`text-xs px-1.5 py-0.5 ${
                    source.fetchStatus === "success" ? "bg-green-100 text-green-700" :
                    source.fetchStatus === "error" ? "bg-red-100 text-red-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {source.fetchStatus}
                  </span>
                ) : "-"}
                {source.fetchError && (
                  <span className="ml-2 text-red-600 text-xs">{source.fetchError}</span>
                )}
              </dd>
            </div>
            {source.sourceUrl && (
              <div className="col-span-2">
                <dt className="text-harbour-500">Careers URL</dt>
                <dd>
                  <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-harbour-600 hover:underline">
                    {source.sourceUrl}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          
          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-harbour-100">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="sync" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors"
              >
                {isLoading ? "Syncing..." : "Sync Now"}
              </button>
            </fetcher.Form>
            <fetcher.Form 
              method="post" 
              onSubmit={(e) => {
                if (!confirm("Delete this import source and all imported jobs? This cannot be undone.")) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="delete" />
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
              >
                Delete Source
              </button>
            </fetcher.Form>
          </div>
        </div>

        {isVerafinManualMode && (
          <div className="bg-amber-50 border border-amber-200 p-6">
            <h2 className="text-lg font-semibold text-amber-800 mb-2">Manual Workday Ingestion (Verafin)</h2>
            <p className="text-sm text-amber-700 mb-3">
              Cloudflare blocks server fetches for this source. Use this fallback: run the script on the Workday careers page, then paste the JSON output below.
            </p>
            <ol className="list-decimal list-inside text-sm text-amber-700 space-y-1 mb-4">
              <li>Open the Verafin careers page in your browser.</li>
              <li>Open DevTools Console, paste this script, and run it.</li>
              <li>Copy the JSON output (it also tries to copy automatically).</li>
              <li>Paste JSON below and click "Ingest Manual JSON".</li>
            </ol>
            <pre className="p-3 text-xs text-harbour-700 bg-white border border-amber-200 overflow-x-auto whitespace-pre-wrap break-words font-mono mb-4">
              {VERAFIN_BROWSER_SCRIPT}
            </pre>

            <fetcher.Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="manual-sync" />
              <label className="block text-sm font-medium text-amber-800" htmlFor="manualJobsJson">
                Manual JSON
              </label>
              <textarea
                id="manualJobsJson"
                name="manualJobsJson"
                rows={12}
                placeholder='Paste JSON array (or {"jobs":[...]}) from the console script'
                className="w-full px-3 py-2 border border-amber-200 bg-white text-sm font-mono text-harbour-700"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-medium transition-colors"
              >
                {isLoading ? "Ingesting..." : "Ingest Manual JSON"}
              </button>
            </fetcher.Form>
          </div>
        )}

        <div className="bg-white border border-harbour-200 p-6">
          <h2 className="text-lg font-semibold text-harbour-700 mb-2">Technology Extraction</h2>
          <p className="text-sm text-harbour-500 mb-4">
            Extract technology mentions from this source&apos;s job descriptions, preview them, then apply selected items to company technology evidence.
          </p>

          <techFetcher.Form method="post" className="mb-4">
            <input type="hidden" name="intent" value="extract-tech-preview" />
            <button
              type="submit"
              disabled={isTechLoading}
              className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 disabled:bg-harbour-300 text-white font-medium transition-colors"
            >
              {isTechLoading ? "Extracting..." : "Extract Technologies (Preview)"}
            </button>
          </techFetcher.Form>

          {techResult && "success" in techResult && !techResult.success && (
            <div className="p-3 bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
              {"error" in techResult ? techResult.error : "Extraction failed."}
            </div>
          )}

          {techPreview && (
            <div className="border border-harbour-200">
              <div className="px-4 py-3 bg-harbour-50 border-b border-harbour-200">
                <p className="text-sm text-harbour-700 font-medium">
                  Preview: {techPreview.uniqueTechnologies} technologies from {techPreview.jobsScanned} jobs ({techPreview.mentionsFound} mentions)
                </p>
                {techResult && "applyResult" in techResult && techResult.applyResult && (
                  <p className="text-xs text-green-700 mt-1">
                    Applied. Assigned: {techResult.applyResult.assignedCount}, Evidence Created: {techResult.applyResult.evidenceCreated}, Updated: {techResult.applyResult.evidenceUpdated}, Skipped: {techResult.applyResult.skipped}
                  </p>
                )}
              </div>

              <techFetcher.Form method="post" className="p-4 flex flex-col gap-4">
                <input type="hidden" name="intent" value="apply-tech-preview" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tech-sourceType" className="text-sm font-medium text-harbour-700">
                      Source Type
                    </label>
                    <select
                      id="tech-sourceType"
                      name="sourceType"
                      defaultValue={techDefaults.sourceType}
                      className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                    >
                      <option value="job_posting">job_posting</option>
                      <option value="manual">manual</option>
                      <option value="survey">survey</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tech-lastVerified" className="text-sm font-medium text-harbour-700">
                      Last Verified (YYYY-MM)
                    </label>
                    <input
                      type="text"
                      id="tech-lastVerified"
                      name="lastVerified"
                      defaultValue={techDefaults.lastVerified}
                      className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tech-sourceLabel" className="text-sm font-medium text-harbour-700">
                      Source Label
                    </label>
                    <input
                      type="text"
                      id="tech-sourceLabel"
                      name="sourceLabel"
                      defaultValue={techDefaults.sourceLabel || "Imported Job Postings"}
                      className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="tech-sourceUrl" className="text-sm font-medium text-harbour-700">
                      Source URL
                    </label>
                    <input
                      type="url"
                      id="tech-sourceUrl"
                      name="sourceUrl"
                      defaultValue={techDefaults.sourceUrl || ""}
                      className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="border border-harbour-200">
                  <table className="w-full">
                    <thead className="bg-harbour-50 border-b border-harbour-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm font-medium text-harbour-600 w-10">Use</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-harbour-600">Technology</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-harbour-600">Category</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-harbour-600">Mentions</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-harbour-600">Jobs</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-harbour-600">Evidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-harbour-100">
                      {techPreview.items.map((item) => (
                        <tr key={item.technologyId}>
                          <td className="px-3 py-2 align-top">
                            <input
                              type="checkbox"
                              name="selectedTechnologyIds"
                              value={item.technologyId}
                              defaultChecked
                              className="border border-harbour-300"
                            />
                          </td>
                          <td className="px-3 py-2 text-sm text-harbour-700">{item.technologyName}</td>
                          <td className="px-3 py-2 text-sm text-harbour-500">
                            {categoryLabels[item.category as TechnologyCategory] || item.category}
                          </td>
                          <td className="px-3 py-2 text-sm text-harbour-500">{item.mentionCount}</td>
                          <td className="px-3 py-2 text-sm text-harbour-500">{item.jobCount}</td>
                          <td className="px-3 py-2 text-xs text-harbour-600">
                            {item.examples.map((example) => (
                              <details key={`${item.technologyId}-${example.jobId}`} className="mb-1">
                                <summary className="cursor-pointer hover:text-harbour-700">
                                  {example.jobTitle} (conf {example.confidence})
                                </summary>
                                <p className="mt-1 text-harbour-500">{example.context || "No context snippet"}</p>
                              </details>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="submit"
                  disabled={isTechLoading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors self-start"
                >
                  {isTechLoading ? "Applying..." : "Apply Selected to Company"}
                </button>
              </techFetcher.Form>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4">
          <div className="p-4 border border-blue-200 bg-blue-50 text-center">
            <div className="text-3xl font-bold text-blue-600">{pendingReviewJobs.length}</div>
            <div className="text-sm text-blue-700">Pending Review</div>
          </div>
          <div className="p-4 border border-harbour-200 bg-white text-center">
            <div className="text-3xl font-bold text-green-600">{activeJobs.length}</div>
            <div className="text-sm text-harbour-500">Active Jobs</div>
          </div>
          <div className="p-4 border border-harbour-200 bg-white text-center">
            <div className="text-3xl font-bold text-amber-500">{hiddenJobs.length}</div>
            <div className="text-sm text-harbour-500">Hidden Jobs</div>
          </div>
          <div className="p-4 border border-harbour-200 bg-white text-center">
            <div className="text-3xl font-bold text-slate-400">{removedJobs.length}</div>
            <div className="text-sm text-harbour-500">Removed Jobs</div>
          </div>
          <div className="p-4 border border-harbour-200 bg-white text-center">
            <div className="text-3xl font-bold text-harbour-600">{source.totalJobCount}</div>
            <div className="text-sm text-harbour-500">Total Tracked</div>
          </div>
        </div>

        {/* Pending Review Jobs */}
        {pendingReviewJobs.length > 0 && (
          <div className="border border-blue-200 bg-white overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
              <h2 className="font-medium text-blue-800">Pending Review ({pendingReviewJobs.length})</h2>
              <p className="text-xs text-blue-600 mt-1">New jobs awaiting review. Approve to make visible, or hide to reject.</p>
            </div>
            <table className="w-full">
              <thead className="bg-blue-50/50 border-b border-blue-100">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Title</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Location</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Department</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-harbour-600">Type</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">First Seen</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-harbour-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {pendingReviewJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-blue-50/50">
                    <td className="px-4 py-3">
                      <JobTitleWithDescription
                        title={job.title}
                        url={job.url}
                        descriptionText={job.descriptionText}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-harbour-500">{job.location || "-"}</td>
                    <td className="px-4 py-3 text-sm text-harbour-500">{job.department || "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <WorkplaceBadge type={job.workplaceType} />
                    </td>
                    <td className="px-4 py-3 text-sm text-harbour-400">{formatDate(job.firstSeenAt)}</td>
                    <td className="px-4 py-3 text-right flex gap-1 justify-end">
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="approve" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
                        >
                          Approve
                        </button>
                      </fetcher.Form>
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="approve-non-technical" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        >
                          Non-technical
                        </button>
                      </fetcher.Form>
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="hide" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
                        >
                          Hide
                        </button>
                      </fetcher.Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Active Jobs */}
        {activeJobs.length > 0 && (
          <div className="border border-harbour-200 bg-white overflow-hidden">
            <div className="px-4 py-3 bg-harbour-50 border-b border-harbour-200">
              <h2 className="font-medium text-harbour-700">Active Jobs ({activeJobs.length})</h2>
              <p className="text-xs text-harbour-400 mt-1">These jobs are shown on the company page. Hide jobs you don't want displayed.</p>
            </div>
            <table className="w-full">
              <thead className="bg-harbour-50 border-b border-harbour-200">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Title</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Location</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Department</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-harbour-600">Type</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">First Seen</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-harbour-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {activeJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-harbour-50">
                    <td className="px-4 py-3">
                      <JobTitleWithDescription
                        title={job.title}
                        url={job.url}
                        descriptionText={job.descriptionText}
                        badge={
                          !job.isTechnical
                            ? <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600">Non-tech</span>
                            : undefined
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-harbour-500">{job.location || "-"}</td>
                    <td className="px-4 py-3 text-sm text-harbour-500">{job.department || "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <WorkplaceBadge type={job.workplaceType} />
                    </td>
                    <td className="px-4 py-3 text-sm text-harbour-400">{formatDate(job.firstSeenAt)}</td>
                    <td className="px-4 py-3 text-right flex gap-1 justify-end">
                      {job.isTechnical ? (
                        <fetcher.Form method="post" className="inline">
                          <input type="hidden" name="intent" value="mark-non-technical" />
                          <input type="hidden" name="jobId" value={job.id} />
                          <button
                            type="submit"
                            className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            Non-technical
                          </button>
                        </fetcher.Form>
                      ) : (
                        <fetcher.Form method="post" className="inline">
                          <input type="hidden" name="intent" value="mark-technical" />
                          <input type="hidden" name="jobId" value={job.id} />
                          <button
                            type="submit"
                            className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
                          >
                            Technical
                          </button>
                        </fetcher.Form>
                      )}
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="hide" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
                        >
                          Hide
                        </button>
                      </fetcher.Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Hidden Jobs */}
        {hiddenJobs.length > 0 && (
          <div className="border border-amber-200 bg-white overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
              <h2 className="font-medium text-amber-800">Hidden Jobs ({hiddenJobs.length})</h2>
              <p className="text-xs text-amber-600 mt-1">These jobs won't be shown on the company page and won't be reactivated by syncs.</p>
            </div>
            <table className="w-full">
              <thead className="bg-amber-50/50 border-b border-amber-100">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Title</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Location</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Department</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">First Seen</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-harbour-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {hiddenJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-amber-50/50">
                    <td className="px-4 py-3">
                      <JobTitleWithDescription
                        title={job.title}
                        url={job.url}
                        descriptionText={job.descriptionText}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-harbour-500">{job.location || "-"}</td>
                    <td className="px-4 py-3 text-sm text-harbour-500">{job.department || "-"}</td>
                    <td className="px-4 py-3 text-sm text-harbour-400">{formatDate(job.firstSeenAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="unhide" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
                        >
                          Unhide
                        </button>
                      </fetcher.Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Removed Jobs */}
        {removedJobs.length > 0 && (
          <div className="border border-harbour-200 bg-white overflow-hidden">
            <div className="px-4 py-3 bg-harbour-50 border-b border-harbour-200">
              <h2 className="font-medium text-harbour-700">Removed/Historical Jobs ({removedJobs.length})</h2>
            </div>
            <table className="w-full">
              <thead className="bg-harbour-50 border-b border-harbour-200">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Title</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Location</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-harbour-600">Status</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">First Seen</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">Removed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {removedJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-harbour-50 opacity-60">
                    <td className="px-4 py-3">
                      <JobTitleWithDescription
                        title={job.title}
                        url={job.url}
                        descriptionText={job.descriptionText}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-harbour-500">{job.location || "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-harbour-400">{formatDate(job.firstSeenAt)}</td>
                    <td className="px-4 py-3 text-sm text-harbour-400">{formatDate(job.removedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {source.jobs.length === 0 && (
          <div className="p-8 border border-harbour-200 bg-harbour-50 text-center">
            <p className="text-harbour-600">No jobs imported yet. Click "Sync Now" to fetch jobs.</p>
          </div>
        )}
      </div>
    </div>
  );
}
