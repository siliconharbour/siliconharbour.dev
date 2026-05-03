import type { Route } from "./+types/jobs";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getAllImportSources,
  syncJobs,
  getAllPendingJobs,
  hideAllPendingJobs,
  approveJob,
  approveJobAsNonTechnical,
  hideImportedJob,
} from "~/lib/job-importers/sync.server";
import { getAllCompanies } from "~/lib/companies.server";
import { sourceTypeLabels } from "~/lib/job-importers/types";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import Jobs - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const [sources, companies, pendingJobs] = await Promise.all([
    getAllImportSources(),
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
  await requireAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync") {
    const sourceId = Number(formData.get("sourceId"));
    if (!sourceId) {
      return { success: false, error: "Source ID required" };
    }

    const result = await syncJobs(sourceId);
    return { intent: "sync", ...result };
  }

  if (intent === "sync-all") {
    const sources = await getAllImportSources();
    const results: Array<{
      sourceId: number;
      success: boolean;
      added?: number;
      updated?: number;
      removed?: number;
      reactivated?: number;
      totalActive?: number;
      error?: string;
    }> = [];

    for (const source of sources) {
      const result = await syncJobs(source.id);
      results.push({ sourceId: source.id, ...result });
    }

    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const totalAdded = succeeded.reduce((s, r) => s + (r.added || 0), 0);
    const totalUpdated = succeeded.reduce((s, r) => s + (r.updated || 0), 0);
    const totalRemoved = succeeded.reduce((s, r) => s + (r.removed || 0), 0);
    const totalReactivated = succeeded.reduce((s, r) => s + (r.reactivated || 0), 0);

    return {
      intent: "sync-all",
      success: failed.length === 0,
      sourcesTotal: sources.length,
      sourcesSucceeded: succeeded.length,
      sourcesFailed: failed.length,
      added: totalAdded,
      updated: totalUpdated,
      removed: totalRemoved,
      reactivated: totalReactivated,
      errors: failed.map((f) => f.error).filter(Boolean),
    };
  }

  if (intent === "review-job") {
    const jobId = Number(formData.get("jobId"));
    const reviewAction = formData.get("action") as string;
    if (!jobId) return { success: false, error: "Job ID required" };

    if (reviewAction === "approve") {
      await approveJob(jobId);
    } else if (reviewAction === "approve-non-technical") {
      await approveJobAsNonTechnical(jobId);
    } else if (reviewAction === "hide") {
      await hideImportedJob(jobId);
    }
    return { intent: "review-job", success: true };
  }

  if (intent === "hide-all-pending") {
    const count = await hideAllPendingJobs();
    return { intent: "hide-all-pending", success: true, hidden: count };
  }

  return { success: false, error: "Unknown action" };
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "Never";
  return new Date(date).toLocaleString("en-CA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-harbour-400">-</span>;

  const colors: Record<string, string> = {
    success: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-700",
  };

  return (
    <span
      className={`text-xs px-1.5 py-0.5 ${colors[status] || "bg-harbour-100 text-harbour-600"}`}
    >
      {status}
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
    <div className={`flex items-center gap-3 p-3 border border-harbour-200 bg-white ${isActing ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-harbour-700 truncate">{job.title}</span>
          {job.sourceType && (
            <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-500">
              {sourceTypeLabels[job.sourceType as keyof typeof sourceTypeLabels] || job.sourceType}
            </span>
          )}
        </div>
        <p className="text-sm text-harbour-400 truncate">
          {[job.companyName, job.location, job.workplaceType].filter(Boolean).join(" \u2022 ")}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 text-xs text-harbour-500 hover:text-harbour-700 border border-harbour-200 hover:border-harbour-300"
          >
            View
          </a>
        )}
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="review-job" />
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="action" value="approve" />
          <button
            type="submit"
            disabled={isActing}
            className="px-2 py-1 text-xs text-green-700 hover:bg-green-50 border border-green-200 hover:border-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Approve
          </button>
        </fetcher.Form>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="review-job" />
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="action" value="approve-non-technical" />
          <button
            type="submit"
            disabled={isActing}
            className="px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 border border-amber-200 hover:border-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Non-Tech
          </button>
        </fetcher.Form>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="review-job" />
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="action" value="hide" />
          <button
            type="submit"
            disabled={isActing}
            className="px-2 py-1 text-xs text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
    fetcher.data && "intent" in fetcher.data && fetcher.data.intent === "sync-all"
      ? fetcher.data
      : null;

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-harbour-700">Job Import Sources</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/manage/import/jobs/importers"
              className="px-4 py-2 bg-harbour-100 hover:bg-harbour-200 text-harbour-700 font-medium transition-colors"
            >
              Importer Docs
            </Link>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="sync-all" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors"
              >
                {isSyncAllLoading ? "Syncing All..." : "Sync All"}
              </button>
            </fetcher.Form>
            <Link
              to="/manage/import/jobs/new"
              className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
            >
              Add Source
            </Link>
          </div>
        </div>

        {syncResult && (
          <div
            className={`p-4 ${syncResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
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
            className={`p-4 ${syncAllResult.sourcesFailed === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}
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
                  {syncAllResult.errors.map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Pending job triage */}
        {pendingJobs.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-harbour-700">
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
                  className="px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 border border-red-200 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Hide All Remaining
                </button>
              </fetcher.Form>
            </div>
            <div className="flex flex-col gap-1">
              {pendingJobs.map((job) => (
                <PendingJobRow key={job.id} job={job} />
              ))}
            </div>
          </div>
        )}

        {sources.length === 0 ? (
          <div className="p-8 border border-harbour-200 bg-harbour-50 text-center">
            <p className="text-harbour-600 mb-4">No job import sources configured yet.</p>
            <Link
              to="/manage/import/jobs/new"
              className="text-harbour-600 hover:text-harbour-700 underline"
            >
              Add your first source
            </Link>
          </div>
        ) : (
          <div className="border border-harbour-200 bg-white overflow-x-auto">
            <table className="w-full">
              <thead className="bg-harbour-50 border-b border-harbour-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Identifier
                  </th>
                  <th
                    className="px-4 py-3 text-center text-sm font-medium text-harbour-600"
                    title="Active / Pending Review"
                  >
                    Jobs
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-harbour-600">
                    Last Fetch
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-harbour-600">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-harbour-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-harbour-100">
                {sources.map((source) => {
                  const isThisRowSyncing =
                    isLoading && activeIntent === "sync" && activeSourceId === source.id;

                  return (
                    <tr key={source.id} className="hover:bg-harbour-50">
                      <td className="px-4 py-3">
                        {source.company ? (
                          <Link
                            to={`/directory/companies/${source.company.slug}`}
                            className="text-harbour-600 hover:underline font-medium"
                          >
                            {source.company.name}
                          </Link>
                        ) : (
                          <span className="text-harbour-400">Unknown</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-harbour-500">
                        {sourceTypeLabels[source.sourceType as keyof typeof sourceTypeLabels] ||
                          source.sourceType}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-harbour-400" title={source.sourceIdentifier}>
                        {source.sourceIdentifier.length > 13
                          ? source.sourceIdentifier.slice(0, 10) + "..."
                          : source.sourceIdentifier}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-700 font-medium">
                          {source.activeJobCount}
                        </span>
                        {source.pendingReviewCount > 0 && (
                          <span
                            className="ml-1 text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 font-medium"
                            title="Pending review"
                          >
                            {source.pendingReviewCount}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-harbour-400">
                        {formatDate(source.lastFetchedAt)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={source.fetchStatus} />
                        {source.fetchError && (
                          <span className="ml-1 text-red-500 cursor-help" title={source.fetchError}>
                            !
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="sync" />
                            <input type="hidden" name="sourceId" value={source.id} />
                            <button
                              type="submit"
                              disabled={isLoading}
                              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white transition-colors"
                            >
                              {isThisRowSyncing ? "..." : "Sync"}
                            </button>
                          </fetcher.Form>
                          <Link
                            to={`/manage/import/jobs/${source.id}`}
                            className="px-2 py-1 text-xs bg-harbour-100 hover:bg-harbour-200 text-harbour-700 transition-colors"
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

        <p className="text-sm text-harbour-400">
          Job import sources let you automatically pull job listings from company career pages.
        </p>
      </div>
    </div>
  );
}
