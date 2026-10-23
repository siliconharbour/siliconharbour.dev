import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/jobs";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getAllImportSourcesWithStats, getAllPendingJobs } from "~/lib/job-importers/sync.server";
import { getAllCompanies } from "~/lib/companies.server";
import { sourceTypeLabels } from "~/lib/job-importers/types";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import Jobs - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const [sources, companies, pendingJobs] = await Promise.all([
    getAllImportSourcesWithStats(),
    getAllCompanies(true),
    getAllPendingJobs(),
  ]);

  // Create a map of company id to company for easy lookup
  const companyMap = new Map(companies.map((c) => [c.id, c]));

  // Enrich sources with company info
  const enrichedSources = sources.map((source) => ({
    ...source,
    company: companyMap.get(source.companyId),
  }));

  return { sources: enrichedSources, pendingJobs };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "sync") {
    const result = await runAdminOperation(request, operationCatalog.jobSourceSync, {
      id: Number(form.get("sourceId")),
      confirm: true,
    });
    return result.ok
      ? ({ intent: "sync" as const, ...result.data } as const)
      : ({ success: false, error: result.error } as const);
  }
  if (intent === "sync-all") {
    const result = await runAdminOperation(request, operationCatalog.jobSourceSyncAll, {
      confirm: true,
    });
    return result.ok
      ? ({ intent: "sync-all" as const, ...result.data } as const)
      : ({ success: false, error: result.error } as const);
  }
  if (intent === "review-job") {
    const review = form.get("action");
    const operation =
      review === "approve"
        ? operationCatalog.jobApprove
        : review === "hide"
          ? operationCatalog.jobHide
          : review === "approve-non-technical"
            ? operationCatalog.jobApproveNonTechnical
            : null;
    if (!operation) return { success: false, error: "Unknown review action" } as const;
    const result = await runAdminOperation(request, operation, { id: Number(form.get("jobId")) });
    return result.ok
      ? ({ intent: "review-job" as const, success: true } as const)
      : ({ success: false, error: result.error } as const);
  }
  if (intent === "hide-all-pending") {
    const result = await runAdminOperation(request, operationCatalog.jobHideAllPending, {
      confirm: true,
    });
    return result.ok
      ? ({ intent: "hide-all-pending" as const, success: true, ...result.data } as const)
      : ({ success: false, error: result.error } as const);
  }
  return { success: false, error: "Unknown action" } as const;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "Never";
  return new Date(date).toLocaleString("en-CA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-subtle">-</span>;

  const colors: Record<string, string> = {
    success: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    rate_limited: "bg-amber-100 text-amber-800",
    pending: "bg-amber-100 text-amber-700",
  };

  return (
    <span className={`text-xs px-pad-1-5 py-pad-0-5 ${colors[status] || "bg-tint text-body"}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function PendingJobRow({
  job,
}: {
  job: {
    id: number;
    title: string;
    location: string | null;
    workplaceType: string | null;
    url: string | null;
    companyName: string | null;
    sourceType: string | null;
  };
}) {
  const fetcher = useFetcher();
  const isActing = fetcher.state !== "idle";

  return (
    <div
      className={`flex flex-col gap-gap-3 p-pad-3 border border-line bg-surface sm:flex-row sm:items-center ${isActing ? "opacity-50" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-gap-2">
          <span className="block w-full font-medium text-heading break-words sm:w-auto">
            {job.title}
          </span>
          {job.sourceType && (
            <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-muted">
              {sourceTypeLabels[job.sourceType as keyof typeof sourceTypeLabels] || job.sourceType}
            </span>
          )}
        </div>
        <p className="text-sm text-subtle break-words">
          {[job.companyName, job.location, job.workplaceType].filter(Boolean).join(" \u2022 ")}
        </p>
      </div>
      <div className="grid w-full grid-cols-3 gap-gap-1 sm:flex sm:w-auto sm:flex-nowrap sm:items-center">
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center px-pad-2 py-pad-1 text-xs text-muted hover:text-heading border border-line hover:border-harbour-300"
          >
            View
          </a>
        )}
        <fetcher.Form method="post" className="contents sm:block">
          <input type="hidden" name="intent" value="review-job" />
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="action" value="approve" />
          <button
            type="submit"
            disabled={isActing}
            className="w-full px-pad-2 py-pad-1 text-xs text-green-700 hover:bg-green-50 border border-green-200 hover:border-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Approve
          </button>
        </fetcher.Form>
        <fetcher.Form method="post" className="contents sm:block">
          <input type="hidden" name="intent" value="review-job" />
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="action" value="approve-non-technical" />
          <button
            type="submit"
            disabled={isActing}
            className="w-full px-pad-2 py-pad-1 text-xs text-amber-700 hover:bg-amber-50 border border-amber-200 hover:border-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Non-Tech
          </button>
        </fetcher.Form>
        <fetcher.Form method="post" className="contents sm:block">
          <input type="hidden" name="intent" value="review-job" />
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="action" value="hide" />
          <button
            type="submit"
            disabled={isActing}
            className="w-full px-pad-2 py-pad-1 text-xs text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Hide
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}

export default function ManageImportJobs() {
  const { sources, pendingJobs } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const isLoading = fetcher.state !== "idle";
  const activeIntent = fetcher.formData?.get("intent");
  const activeSourceId = Number(fetcher.formData?.get("sourceId"));
  const isSyncAllLoading = isLoading && activeIntent === "sync-all";
  const syncResult =
    fetcher.data && "intent" in fetcher.data && fetcher.data.intent === "sync"
      ? fetcher.data
      : null;
  const syncAllResult =
    fetcher.data &&
    "intent" in fetcher.data &&
    fetcher.data.intent === "sync-all" &&
    "sourcesTotal" in fetcher.data
      ? fetcher.data
      : null;

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-gap-6">
        <div className="flex flex-col gap-gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold text-heading">Job Import Sources</h1>
          <div className="grid grid-cols-2 gap-gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Link
              to="/manage/import/jobs/technl"
              className="block w-full px-pad-4 py-pad-2 bg-tint hover:bg-harbour-200 text-heading font-medium transition-colors text-center"
            >
              TechNL Board
            </Link>
            <Link
              to="/manage/import/jobs/importers"
              className="block w-full px-pad-4 py-pad-2 bg-tint hover:bg-harbour-200 text-heading font-medium transition-colors text-center"
            >
              Importer Docs
            </Link>
            <fetcher.Form method="post" className="w-full">
              <input type="hidden" name="intent" value="sync-all" />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-pad-4 py-pad-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors"
              >
                {isSyncAllLoading ? "Syncing All..." : "Sync All"}
              </button>
            </fetcher.Form>
            <Link
              to="/manage/import/jobs/new"
              className="block w-full px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors text-center"
            >
              Add Source
            </Link>
          </div>
        </div>

        {syncResult && (
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
                <p className="text-sm text-green-600">
                  Total active jobs: {syncResult.totalActive}
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

        {syncAllResult && (
          <div
            className={`p-pad-4 ${syncAllResult.sourcesFailed === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}
          >
            <p
              className={`font-medium ${syncAllResult.sourcesFailed === 0 ? "text-green-700" : "text-amber-700"}`}
            >
              Sync All completed: {syncAllResult.sourcesSucceeded}/{syncAllResult.sourcesTotal}{" "}
              sources succeeded
            </p>
            <p
              className={`text-sm ${syncAllResult.sourcesFailed === 0 ? "text-green-600" : "text-amber-600"}`}
            >
              Added: {syncAllResult.added}, Updated: {syncAllResult.updated}, Removed:{" "}
              {syncAllResult.removed}, Reactivated: {syncAllResult.reactivated}
            </p>
            {syncAllResult.errors && syncAllResult.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium text-red-700">
                  {syncAllResult.sourcesFailed} source(s) failed:
                </p>
                <ul className="text-sm text-red-600 list-disc list-inside">
                  {syncAllResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Pending job triage */}
        {pendingJobs.length > 0 && (
          <div className="flex flex-col gap-gap-3">
            <div className="flex flex-col gap-gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-heading">
                Pending Review ({pendingJobs.length})
              </h2>
              <fetcher.Form
                method="post"
                onSubmit={(e) => {
                  if (!confirm(`Hide all ${pendingJobs.length} pending jobs?`)) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="hide-all-pending" />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-pad-3 py-pad-1-5 text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Hide All Remaining
                </button>
              </fetcher.Form>
            </div>
            <div className="flex flex-col gap-gap-1">
              {pendingJobs.map((job) => (
                <PendingJobRow key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}

        {sources.length === 0 ? (
          <div className="p-pad-8 border border-line bg-soft text-center">
            <p className="text-body mb-4">No job import sources configured yet.</p>
            <Link to="/manage/import/jobs/new" className="text-body hover:text-heading underline">
              Add your first source
            </Link>
          </div>
        ) : (
          <div className="border border-line bg-surface overflow-x-auto rounded-panel">
            <table className="w-full">
              <thead className="bg-soft border-b border-line">
                <tr>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Company
                  </th>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Source
                  </th>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Identifier
                  </th>
                  <th
                    className="px-pad-4 py-pad-3 text-center text-sm font-medium text-body"
                    title="Active / Pending Review"
                  >
                    Jobs
                  </th>
                  <th className="px-pad-4 py-pad-3 text-left text-sm font-medium text-body">
                    Last Fetch
                  </th>
                  <th className="px-pad-4 py-pad-3 text-center text-sm font-medium text-body">
                    Status
                  </th>
                  <th className="px-pad-4 py-pad-3 text-right text-sm font-medium text-body">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {sources.map((source) => {
                  const isThisRowSyncing =
                    isLoading && activeIntent === "sync" && activeSourceId === source.id;

                  return (
                    <tr key={source.id} className="hover:bg-soft">
                      <td className="px-pad-4 py-pad-3">
                        {source.company ? (
                          <Link
                            to={`/directory/companies/${source.company.slug}`}
                            className="text-body hover:underline font-medium"
                          >
                            {source.company.name}
                          </Link>
                        ) : (
                          <span className="text-subtle">Unknown</span>
                        )}
                      </td>
                      <td className="px-pad-4 py-pad-3 text-sm text-muted">
                        {sourceTypeLabels[source.sourceType as keyof typeof sourceTypeLabels] ||
                          source.sourceType}
                      </td>
                      <td
                        className="px-pad-4 py-pad-3 text-sm font-mono text-subtle"
                        title={source.sourceIdentifier}
                      >
                        {source.sourceIdentifier.length > 13
                          ? source.sourceIdentifier.slice(0, 10) + "..."
                          : source.sourceIdentifier}
                      </td>
                      <td className="px-pad-4 py-pad-3 text-center">
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-heading font-medium">
                          {source.activeJobCount}
                        </span>
                        {source.pendingReviewCount > 0 && (
                          <span
                            className="ml-1 text-xs px-pad-1-5 py-pad-0-5 bg-amber-100 text-amber-700 font-medium"
                            title="Pending review"
                          >
                            {source.pendingReviewCount}
                          </span>
                        )}
                      </td>
                      <td className="px-pad-4 py-pad-3 text-sm text-subtle">
                        {formatDate(source.lastFetchedAt)}
                      </td>
                      <td className="px-pad-4 py-pad-3 text-center">
                        <StatusBadge status={source.fetchStatus} />
                        {source.fetchError && (
                          <span className="ml-1 text-red-500 cursor-help" title={source.fetchError}>
                            !
                          </span>
                        )}
                      </td>
                      <td className="px-pad-4 py-pad-3 text-right">
                        <div className="flex items-center justify-end gap-gap-2">
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="sync" />
                            <input type="hidden" name="sourceId" value={source.id} />
                            <button
                              type="submit"
                              disabled={isLoading}
                              className="px-pad-2 py-pad-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white transition-colors"
                            >
                              {isThisRowSyncing ? "..." : "Sync"}
                            </button>
                          </fetcher.Form>
                          <Link
                            to={`/manage/import/jobs/${source.id}`}
                            className="px-pad-2 py-pad-1 text-xs bg-tint hover:bg-harbour-200 text-heading transition-colors"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-sm text-subtle">
          Job import sources let you automatically pull job listings from company career pages.
        </p>
      </div>
    </div>
  );
}
