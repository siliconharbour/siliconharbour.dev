import { loadAdminOperation, runAdminOperation } from "~/lib/admin/run-operation.server";
import { jsonFromForm } from "~/lib/admin/import-form-adapters";
import { VERAFIN_BROWSER_SCRIPT } from "~/lib/job-importers/verafin-browser-script";
import { operationCatalog } from "~/operations/catalog";

import { defaultLastVerifiedMonth, isVerafinManualSource } from "~/lib/job-importers/manual";
import type { Route } from "./+types/jobs.$sourceId";
import { Link, useLoaderData, useFetcher, redirect } from "react-router";
import type { ReactNode } from "react";
import { requireAdmin } from "~/lib/session.server";

import { sourceTypeLabels } from "~/lib/job-importers/types";

import {
  technologyProvenanceSourceOptions,
  type TechnologyProvenanceSourceKey,
} from "~/lib/technology-evidence";
import { categoryLabels, type TechnologyCategory } from "~/lib/technology-categories";

export function meta({ loaderData: data }: Route.MetaArgs) {
  const companyName = data?.company?.name || "Source";
  return [{ title: `${companyName} Jobs - Import - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const sourceId = Number(params.sourceId);
  if (!sourceId) {
    throw new Response("Not Found", { status: 404 });
  }

  const source = await loadAdminOperation(request, operationCatalog.jobSourceGet, { id: sourceId });
  if (!source) {
    throw new Response("Not Found", { status: 404 });
  }

  const company = await loadAdminOperation(request, operationCatalog.companyGet, {
    id: source.companyId,
  });

  return { source, company, isVerafinManualMode: isVerafinManualSource(source) };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const id = Number(params.sourceId);
  const intent = form.get("intent");
  if (intent === "sync") {
    const result = await runAdminOperation(request, operationCatalog.jobSourceSync, {
      id,
      confirm: true,
    });
    return result.ok
      ? ({ intent: "sync" as const, ...result.data } as const)
      : ({ success: false, error: result.error } as const);
  }
  if (intent === "manual-sync") {
    const result = await runAdminOperation(request, operationCatalog.jobSourceManualSync, {
      id,
      jobs: jsonFromForm(form, "manualJobsJson"),
    });
    return result.ok
      ? ({ intent: "manual-sync" as const, ...result.data } as const)
      : ({ intent: "manual-sync" as const, success: false, error: result.error } as const);
  }
  if (intent === "extract-tech-preview") {
    const result = await runAdminOperation(request, operationCatalog.jobSourceTechPreviewExtract, {
      id,
    });
    return result.ok
      ? ({ intent: "extract-tech-preview" as const, success: true, ...result.data } as const)
      : ({ success: false, error: result.error } as const);
  }
  if (intent === "apply-tech-preview") {
    const result = await runAdminOperation(request, operationCatalog.jobSourceTechPreviewApply, {
      id,
      technologyIds: form.getAll("selectedTechnologyIds").map(Number),
      sourceKey: form.get("sourceKey") || "job_postings",
      sourceUrl: form.get("sourceUrl") ?? null,
      lastVerified: form.get("lastVerified") || undefined,
    });
    return result.ok
      ? ({ intent: "apply-tech-preview" as const, success: true, ...result.data } as const)
      : ({ success: false, error: result.error } as const);
  }
  if (intent === "delete") {
    const result = await runAdminOperation(request, operationCatalog.jobSourceDelete, {
      id,
      confirm: true,
    });
    return result.ok
      ? redirect("/manage/import/jobs")
      : ({ success: false, error: result.error } as const);
  }
  if (intent === "edit-source") {
    const result = await runAdminOperation(request, operationCatalog.jobSourceUpdate, {
      id,
      sourceIdentifier: form.get("sourceIdentifier"),
      sourceUrl: form.get("sourceUrl") ?? null,
    });
    return result.ok
      ? ({ intent, success: true } as const)
      : ({ intent, success: false, error: result.error } as const);
  }
  const statuses = {
    hide: operationCatalog.jobHide,
    unhide: operationCatalog.jobUnhide,
    "mark-non-technical": operationCatalog.jobMarkNonTechnical,
    "mark-technical": operationCatalog.jobMarkTechnical,
    approve: operationCatalog.jobApprove,
    "approve-non-technical": operationCatalog.jobApproveNonTechnical,
    deactivate: operationCatalog.jobDeactivate,
  };
  if (typeof intent !== "string" || !Object.hasOwn(statuses, intent))
    return { success: false, error: "Unknown action" } as const;
  const jobId = Number(form.get("jobId"));
  const result = await runAdminOperation(request, statuses[intent as keyof typeof statuses], {
    id: jobId,
    ...(intent === "deactivate" && { reason: form.get("reason") || "filled" }),
  });
  return result.ok
    ? ({ intent: intent as keyof typeof statuses, jobId, success: true } as const)
    : ({ success: false, error: result.error } as const);
}

function formatDate(date: Date | string | null | undefined): string {
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
    <span className={`text-xs px-pad-1-5 py-pad-0-5 ${colors[status] || "bg-tint text-body"}`}>
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
    <span className={`text-xs px-pad-1-5 py-pad-0-5 ${colors[type] || "bg-tint text-body"}`}>
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
    <div className="flex flex-col gap-gap-1">
      <div className="flex items-center gap-gap-2">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-body hover:underline"
          >
            {title}
          </a>
        ) : (
          <span className="text-heading">{title}</span>
        )}
        {badge}
      </div>
      {descriptionText && descriptionText.trim().length > 0 && (
        <details className="w-full">
          <summary className="cursor-pointer text-xs text-muted hover:text-heading">
            View full posting text
          </summary>
          <pre className="mt-2 p-pad-2 text-xs text-body bg-soft border border-line whitespace-pre-wrap break-words font-mono">
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
  const pendingReviewJobs = source.jobs.filter((j) => j.status === "pending_review");
  const activeJobs = source.jobs.filter((j) => j.status === "active");
  const hiddenJobs = source.jobs.filter((j) => j.status === "hidden");
  const removedJobs = source.jobs.filter(
    (j) => j.status !== "active" && j.status !== "hidden" && j.status !== "pending_review",
  );
  const techResult =
    techFetcher.data &&
    "intent" in techFetcher.data &&
    (techFetcher.data.intent === "extract-tech-preview" ||
      techFetcher.data.intent === "apply-tech-preview")
      ? techFetcher.data
      : null;
  const techPreview = techResult && "preview" in techResult ? techResult.preview : null;
  const techDefaults =
    techResult && "defaults" in techResult
      ? techResult.defaults
      : {
          sourceKey: "job_postings" as TechnologyProvenanceSourceKey,
          sourceUrl: source.sourceUrl || company?.careersUrl || company?.website || "",
          lastVerified: defaultLastVerifiedMonth(),
        };

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-gap-6">
        <div className="flex items-center gap-gap-4">
          <Link to="/manage/import/jobs" className="text-subtle hover:text-body">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-semibold text-heading">
            {company?.name || "Unknown Company"} - Job Import
          </h1>
          <div className="ml-auto flex items-center gap-gap-2">
            {careersPageUrl && (
              <a
                href={careersPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-pad-3 py-pad-2 bg-tint hover:bg-harbour-200 text-heading text-sm font-medium transition-colors"
              >
                Careers Page
              </a>
            )}
            {companyDetailsPath && (
              <Link
                to={companyDetailsPath}
                className="px-pad-3 py-pad-2 bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
              >
                Company Page
              </Link>
            )}
          </div>
        </div>

        {syncResult && "added" in syncResult && (
          <div
            className={`p-pad-4 ${syncResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
          >
            {syncResult.success ? (
              <div>
                <p className="font-medium text-green-700">Sync completed</p>
                <p className="text-sm text-green-600">
                  Added: {syncResult.added}, Updated: {syncResult.updated}, Removed:{" "}
                  {syncResult.removed}, Reactivated: {syncResult.reactivated}
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
        <div className="bg-surface border border-line p-pad-6 rounded-panel">
          <h2 className="text-lg font-semibold text-heading mb-4">Source Configuration</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-gap-4 text-sm">
            <div>
              <dt className="text-muted">Source Type</dt>
              <dd className="font-medium text-heading">
                {sourceTypeLabels[source.sourceType as keyof typeof sourceTypeLabels] ||
                  source.sourceType}
              </dd>
            </div>
            <div className="col-span-2">
              <fetcher.Form method="post" className="flex flex-col gap-gap-3">
                <input type="hidden" name="intent" value="edit-source" />
                <div>
                  <label className="text-muted text-sm" htmlFor="sourceIdentifier">
                    Identifier
                  </label>
                  <input
                    id="sourceIdentifier"
                    name="sourceIdentifier"
                    type="text"
                    defaultValue={source.sourceIdentifier}
                    className="w-full mt-1 px-pad-2 py-pad-1 text-sm font-mono border border-line text-body focus:outline-none focus:border-harbour-400"
                  />
                </div>
                <div>
                  <label className="text-muted text-sm" htmlFor="editSourceUrl">
                    Careers URL
                  </label>
                  <input
                    id="editSourceUrl"
                    name="sourceUrl"
                    type="text"
                    defaultValue={source.sourceUrl || ""}
                    placeholder="https://..."
                    className="w-full mt-1 px-pad-2 py-pad-1 text-sm border border-line text-body focus:outline-none focus:border-harbour-400"
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    className="px-pad-3 py-pad-1 text-sm bg-primary text-white hover:bg-primary-hover transition-colors"
                  >
                    Save
                  </button>
                </div>
              </fetcher.Form>
            </div>
            <div>
              <dt className="text-muted">Last Fetched</dt>
              <dd className="text-body">{formatDate(source.lastFetchedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">Fetch Status</dt>
              <dd>
                {source.fetchStatus ? (
                  <span
                    className={`text-xs px-pad-1-5 py-pad-0-5 ${
                      source.fetchStatus === "success"
                        ? "bg-green-100 text-green-700"
                        : source.fetchStatus === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {source.fetchStatus.replaceAll("_", " ")}
                  </span>
                ) : (
                  "-"
                )}
                {source.fetchError && (
                  <span
                    className={`ml-2 text-xs ${source.fetchStatus === "rate_limited" ? "text-amber-800" : "text-red-600"}`}
                  >
                    {source.fetchError}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex items-center gap-gap-3 mt-6 pt-pad-4 border-t border-harbour-100">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="sync" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-pad-4 py-pad-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors"
              >
                {isLoading ? "Syncing..." : "Sync Now"}
              </button>
            </fetcher.Form>
            <fetcher.Form
              method="post"
              onSubmit={(e) => {
                if (
                  !confirm(
                    "Delete this import source and all imported jobs? This cannot be undone.",
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="delete" />
              <button
                type="submit"
                className="px-pad-4 py-pad-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
              >
                Delete Source
              </button>
            </fetcher.Form>
          </div>
        </div>

        {isVerafinManualMode && (
          <div className="bg-amber-50 border border-amber-200 p-pad-6">
            <h2 className="text-lg font-semibold text-amber-800 mb-2">
              Manual Workday Ingestion (Verafin)
            </h2>
            <p className="text-sm text-amber-700 mb-3">
              Cloudflare blocks server fetches for this source. Use this fallback: run the script on
              the Workday careers page, then paste the JSON output below.
            </p>
            <ol className="list-decimal list-inside text-sm text-amber-700 space-y-1 mb-4">
              <li>Open the Verafin careers page in your browser.</li>
              <li>Open DevTools Console, paste this script, and run it.</li>
              <li>Copy the JSON output (it also tries to copy automatically).</li>
              <li>Paste JSON below and click "Ingest Manual JSON".</li>
            </ol>
            <pre className="p-pad-3 text-xs text-heading bg-surface border border-amber-200 overflow-x-auto whitespace-pre-wrap break-words font-mono mb-4">
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
                className="w-full px-pad-3 py-pad-2 border border-amber-200 bg-surface text-sm font-mono text-heading"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-pad-4 py-pad-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-medium transition-colors"
              >
                {isLoading ? "Ingesting..." : "Ingest Manual JSON"}
              </button>
            </fetcher.Form>
          </div>
        )}

        <div className="bg-surface border border-line p-pad-6 rounded-panel">
          <h2 className="text-lg font-semibold text-heading mb-2">Technology Extraction</h2>
          <p className="text-sm text-muted mb-4">
            Extract technology mentions from this source&apos;s job descriptions, preview them, then
            apply selected items to company technology evidence.
          </p>

          <techFetcher.Form method="post" className="mb-4">
            <input type="hidden" name="intent" value="extract-tech-preview" />
            <button
              type="submit"
              disabled={isTechLoading}
              className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover disabled:bg-harbour-300 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {isTechLoading ? "Extracting..." : "Extract Technologies (Preview)"}
            </button>
          </techFetcher.Form>

          {techResult && "success" in techResult && !techResult.success && (
            <div className="p-pad-3 bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
              {"error" in techResult ? techResult.error : "Extraction failed."}
            </div>
          )}

          {techPreview && (
            <div className="border border-line">
              <div className="px-pad-4 py-pad-3 bg-soft border-b border-line">
                <p className="text-sm text-heading font-medium">
                  Preview: {techPreview.uniqueTechnologies} technologies from{" "}
                  {techPreview.jobsScanned} jobs ({techPreview.mentionsFound} mentions)
                </p>
                {techResult && "applyResult" in techResult && techResult.applyResult && (
                  <p className="text-xs text-green-700 mt-1">
                    Applied. Assigned: {techResult.applyResult.assignedCount}, Evidence Created:{" "}
                    {techResult.applyResult.evidenceCreated}, Updated:{" "}
                    {techResult.applyResult.evidenceUpdated}, Skipped:{" "}
                    {techResult.applyResult.skipped}
                  </p>
                )}
              </div>

              <techFetcher.Form method="post" className="p-pad-4 flex flex-col gap-gap-4">
                <input type="hidden" name="intent" value="apply-tech-preview" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-3">
                  <div className="flex flex-col gap-gap-1">
                    <label htmlFor="tech-sourceKey" className="text-sm font-medium text-heading">
                      Source
                    </label>
                    <select
                      id="tech-sourceKey"
                      name="sourceKey"
                      defaultValue={techDefaults?.sourceKey}
                      className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                    >
                      {technologyProvenanceSourceOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-gap-1">
                    <label htmlFor="tech-lastVerified" className="text-sm font-medium text-heading">
                      Last Verified (YYYY-MM)
                    </label>
                    <input
                      type="text"
                      id="tech-lastVerified"
                      name="lastVerified"
                      defaultValue={techDefaults?.lastVerified}
                      className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-gap-1">
                    <label htmlFor="tech-sourceUrl" className="text-sm font-medium text-heading">
                      Source URL
                    </label>
                    <input
                      type="url"
                      id="tech-sourceUrl"
                      name="sourceUrl"
                      defaultValue={techDefaults?.sourceUrl || ""}
                      className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="border border-line overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-soft border-b border-line">
                      <tr>
                        <th className="px-pad-3 py-pad-2 text-left text-sm font-medium text-body w-10">
                          Use
                        </th>
                        <th className="px-pad-3 py-pad-2 text-left text-sm font-medium text-body">
                          Technology
                        </th>
                        <th className="px-pad-3 py-pad-2 text-left text-sm font-medium text-body">
                          Category
                        </th>
                        <th className="px-pad-3 py-pad-2 text-left text-sm font-medium text-body">
                          Mentions
                        </th>
                        <th className="px-pad-3 py-pad-2 text-left text-sm font-medium text-body">
                          Jobs
                        </th>
                        <th className="px-pad-3 py-pad-2 text-left text-sm font-medium text-body">
                          Evidence
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-harbour-100">
                      {techPreview.items.map((item) => (
                        <tr key={item.technologyId}>
                          <td className="px-pad-3 py-pad-2 align-top">
                            <input
                              type="checkbox"
                              name="selectedTechnologyIds"
                              value={item.technologyId}
                              defaultChecked
                              className="border border-harbour-300"
                            />
                          </td>
                          <td className="px-pad-3 py-pad-2 text-sm text-heading">
                            {item.technologyName}
                          </td>
                          <td className="px-pad-3 py-pad-2 text-sm text-muted">
                            {categoryLabels[item.category as TechnologyCategory] || item.category}
                          </td>
                          <td className="px-pad-3 py-pad-2 text-sm text-muted">
                            {item.mentionCount}
                          </td>
                          <td className="px-pad-3 py-pad-2 text-sm text-muted">{item.jobCount}</td>
                          <td className="px-pad-3 py-pad-2 text-xs text-body">
                            {item.examples.map((example) => (
                              <details
                                key={`${item.technologyId}-${example.jobId}`}
                                className="mb-1"
                              >
                                <summary className="cursor-pointer hover:text-heading">
                                  {example.jobTitle} (conf {example.confidence})
                                </summary>
                                <p className="mt-1 text-muted">
                                  {example.context || "No context snippet"}
                                </p>
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
                  className="px-pad-4 py-pad-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors self-start"
                >
                  {isTechLoading ? "Applying..." : "Apply Selected to Company"}
                </button>
              </techFetcher.Form>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-gap-4">
          <div className="p-pad-4 border border-blue-200 bg-blue-50 text-center">
            <div className="text-3xl font-bold text-blue-600">{pendingReviewJobs.length}</div>
            <div className="text-sm text-blue-700">Pending Review</div>
          </div>
          <div className="p-pad-4 border border-line bg-surface text-center rounded-panel">
            <div className="text-3xl font-bold text-green-600">{activeJobs.length}</div>
            <div className="text-sm text-muted">Active Jobs</div>
          </div>
          <div className="p-pad-4 border border-line bg-surface text-center rounded-panel">
            <div className="text-3xl font-bold text-amber-500">{hiddenJobs.length}</div>
            <div className="text-sm text-muted">Hidden Jobs</div>
          </div>
          <div className="p-pad-4 border border-line bg-surface text-center rounded-panel">
            <div className="text-3xl font-bold text-slate-400">{removedJobs.length}</div>
            <div className="text-sm text-muted">Removed Jobs</div>
          </div>
          <div className="p-pad-4 border border-line bg-surface text-center rounded-panel">
            <div className="text-3xl font-bold text-body">{source.totalJobCount}</div>
            <div className="text-sm text-muted">Total Tracked</div>
          </div>
        </div>

        {/* Pending Review Jobs */}
        {pendingReviewJobs.length > 0 && (
          <div className="border border-blue-200 bg-surface overflow-x-auto rounded-panel">
            <div className="px-pad-4 py-pad-3 bg-blue-50 border-b border-blue-200">
              <h2 className="font-medium text-blue-800">
                Pending Review ({pendingReviewJobs.length})
              </h2>
              <p className="text-xs text-blue-600 mt-1">
                New jobs awaiting review. Approve to make visible, or hide to reject.
              </p>
            </div>
            <table className="w-full">
              <thead className="bg-blue-50/50 border-b border-blue-100">
                <tr>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Title
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Location
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Department
                  </th>
                  <th className="px-pad-4 py-pad-2 text-center text-sm font-medium text-body">
                    Type
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    First Seen
                  </th>
                  <th className="px-pad-4 py-pad-2 text-right text-sm font-medium text-body">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {pendingReviewJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-blue-50/50">
                    <td className="px-pad-4 py-pad-3">
                      <JobTitleWithDescription
                        title={job.title}
                        url={job.url}
                        descriptionText={job.descriptionText}
                      />
                    </td>
                    <td className="px-pad-4 py-pad-3 text-sm text-muted">{job.location || "-"}</td>
                    <td className="px-pad-4 py-pad-3 text-sm text-muted">
                      {job.department || "-"}
                    </td>
                    <td className="px-pad-4 py-pad-3 text-center">
                      <WorkplaceBadge type={job.workplaceType} />
                    </td>
                    <td className="px-pad-4 py-pad-3 text-sm text-subtle">
                      {formatDate(job.firstSeenAt)}
                    </td>
                    <td className="px-pad-4 py-pad-3 text-right flex gap-gap-1 justify-end">
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="approve" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="px-pad-2 py-pad-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
                        >
                          Approve
                        </button>
                      </fetcher.Form>
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="approve-non-technical" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="px-pad-2 py-pad-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        >
                          Non-technical
                        </button>
                      </fetcher.Form>
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="hide" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="px-pad-2 py-pad-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
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
          <div className="border border-line bg-surface overflow-x-auto rounded-panel">
            <div className="px-pad-4 py-pad-3 bg-soft border-b border-line">
              <h2 className="font-medium text-heading">Active Jobs ({activeJobs.length})</h2>
              <p className="text-xs text-subtle mt-1">
                These jobs are shown on the company page. Hide jobs you don't want displayed.
              </p>
            </div>
            <table className="w-full">
              <thead className="bg-soft border-b border-line">
                <tr>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Title
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Location
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Department
                  </th>
                  <th className="px-pad-4 py-pad-2 text-center text-sm font-medium text-body">
                    Type
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    First Seen
                  </th>
                  <th className="px-pad-4 py-pad-2 text-right text-sm font-medium text-body">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {activeJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-soft">
                    <td className="px-pad-4 py-pad-3">
                      <JobTitleWithDescription
                        title={job.title}
                        url={job.url}
                        descriptionText={job.descriptionText}
                        badge={
                          !job.isTechnical ? (
                            <span className="text-xs px-pad-1-5 py-pad-0-5 bg-slate-100 text-slate-600">
                              Non-tech
                            </span>
                          ) : undefined
                        }
                      />
                    </td>
                    <td className="px-pad-4 py-pad-3 text-sm text-muted">{job.location || "-"}</td>
                    <td className="px-pad-4 py-pad-3 text-sm text-muted">
                      {job.department || "-"}
                    </td>
                    <td className="px-pad-4 py-pad-3 text-center">
                      <WorkplaceBadge type={job.workplaceType} />
                    </td>
                    <td className="px-pad-4 py-pad-3 text-sm text-subtle">
                      {formatDate(job.firstSeenAt)}
                    </td>
                    <td className="px-pad-4 py-pad-3 text-right flex gap-gap-1 justify-end">
                      {job.isTechnical ? (
                        <fetcher.Form method="post" className="inline">
                          <input type="hidden" name="intent" value="mark-non-technical" />
                          <input type="hidden" name="jobId" value={job.id} />
                          <button
                            type="submit"
                            className="px-pad-2 py-pad-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
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
                            className="px-pad-2 py-pad-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
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
                          className="px-pad-2 py-pad-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
                        >
                          Hide
                        </button>
                      </fetcher.Form>
                      <fetcher.Form method="post" className="mt-1">
                        <input type="hidden" name="intent" value="deactivate" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <input type="hidden" name="reason" value="filled" />
                        <button
                          type="submit"
                          className="px-pad-2 py-pad-1 text-xs border border-line text-body hover:bg-soft"
                        >
                          Mark filled
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
          <div className="border border-amber-200 bg-surface overflow-x-auto rounded-panel">
            <div className="px-pad-4 py-pad-3 bg-amber-50 border-b border-amber-200">
              <h2 className="font-medium text-amber-800">Hidden Jobs ({hiddenJobs.length})</h2>
              <p className="text-xs text-amber-600 mt-1">
                These jobs won't be shown on the company page and won't be reactivated by syncs.
              </p>
            </div>
            <table className="w-full">
              <thead className="bg-amber-50/50 border-b border-amber-100">
                <tr>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Title
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Location
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Department
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    First Seen
                  </th>
                  <th className="px-pad-4 py-pad-2 text-right text-sm font-medium text-body">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {hiddenJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-amber-50/50">
                    <td className="px-pad-4 py-pad-3">
                      <JobTitleWithDescription
                        title={job.title}
                        url={job.url}
                        descriptionText={job.descriptionText}
                      />
                    </td>
                    <td className="px-pad-4 py-pad-3 text-sm text-muted">{job.location || "-"}</td>
                    <td className="px-pad-4 py-pad-3 text-sm text-muted">
                      {job.department || "-"}
                    </td>
                    <td className="px-pad-4 py-pad-3 text-sm text-subtle">
                      {formatDate(job.firstSeenAt)}
                    </td>
                    <td className="px-pad-4 py-pad-3 text-right">
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="unhide" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="px-pad-2 py-pad-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
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
          <div className="border border-line bg-surface overflow-x-auto rounded-panel">
            <div className="px-pad-4 py-pad-3 bg-soft border-b border-line">
              <h2 className="font-medium text-heading">
                Removed/Historical Jobs ({removedJobs.length})
              </h2>
            </div>
            <table className="w-full">
              <thead className="bg-soft border-b border-line">
                <tr>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Title
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Location
                  </th>
                  <th className="px-pad-4 py-pad-2 text-center text-sm font-medium text-body">
                    Status
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    First Seen
                  </th>
                  <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                    Removed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {removedJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-soft opacity-60">
                    <td className="px-pad-4 py-pad-3">
                      <JobTitleWithDescription
                        title={job.title}
                        url={job.url}
                        descriptionText={job.descriptionText}
                      />
                    </td>
                    <td className="px-pad-4 py-pad-3 text-sm text-muted">{job.location || "-"}</td>
                    <td className="px-pad-4 py-pad-3 text-center">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-pad-4 py-pad-3 text-sm text-subtle">
                      {formatDate(job.firstSeenAt)}
                    </td>
                    <td className="px-pad-4 py-pad-3 text-sm text-subtle">
                      {formatDate(job.removedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {source.jobs.length === 0 && (
          <div className="p-pad-8 border border-line bg-soft text-center">
            <p className="text-body">No jobs imported yet. Click "Sync Now" to fetch jobs.</p>
          </div>
        )}
      </div>
    </div>
  );
}
