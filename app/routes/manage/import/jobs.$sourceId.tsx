import type { Route } from "./+types/jobs.$sourceId";
import { Link, useLoaderData, useFetcher, redirect } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getImportSourceWithStats, syncJobs, deleteImportSource, hideImportedJob, unhideImportedJob, markJobNonTechnical, markJobTechnical } from "~/lib/job-importers/sync.server";
import { getCompanyById } from "~/lib/companies.server";
import { sourceTypeLabels } from "~/lib/job-importers/types";

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
  
  return { source, company };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);
  
  const sourceId = Number(params.sourceId);
  const formData = await request.formData();
  const intent = formData.get("intent");
  
  if (intent === "sync") {
    const result = await syncJobs(sourceId);
    return { intent: "sync", ...result };
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
    removed: "bg-slate-100 text-slate-600",
    filled: "bg-blue-100 text-blue-700",
    expired: "bg-amber-100 text-amber-700",
    hidden: "bg-amber-100 text-amber-700",
  };
  
  return (
    <span className={`text-xs px-1.5 py-0.5 ${colors[status] || "bg-harbour-100 text-harbour-600"}`}>
      {status}
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

export default function ViewJobImportSource() {
  const { source, company } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  
  const isLoading = fetcher.state !== "idle";
  const syncResult = fetcher.data && "intent" in fetcher.data && fetcher.data.intent === "sync" ? fetcher.data : null;
  
  // Separate active, hidden, and other jobs
  const activeJobs = source.jobs.filter(j => j.status === "active");
  const hiddenJobs = source.jobs.filter(j => j.status === "hidden");
  const removedJobs = source.jobs.filter(j => j.status !== "active" && j.status !== "hidden");

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

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
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
                      <div className="flex items-center gap-2">
                        {job.url ? (
                          <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-harbour-600 hover:underline">
                            {job.title}
                          </a>
                        ) : (
                          <span className="text-harbour-700">{job.title}</span>
                        )}
                        {!job.isTechnical && (
                          <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600">Non-tech</span>
                        )}
                      </div>
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
                    <td className="px-4 py-3 text-harbour-600">{job.title}</td>
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
                    <td className="px-4 py-3 text-harbour-600">{job.title}</td>
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
