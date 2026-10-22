import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/jobs.technl";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAdmin } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "TechNL Job Board - Import - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  try {
    const result = await runAdminOperation(request, operationCatalog.jobTechNLList, {});
    if (!result.ok) return { jobs: [], fetchedAt: new Date().toISOString(), error: result.error };
    return { ...result.data, error: null as string | null };
  } catch (err) {
    return {
      jobs: [],
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get("intent") !== "refresh") return { success: false, error: "Unknown action" } as const;
  const result = await runAdminOperation(request, operationCatalog.jobTechNLRefresh, {
    confirm: true,
  });
  return result.ok
    ? ({ intent: "refresh", success: true, ...result.data } as const)
    : ({ intent: "refresh", success: false, error: result.error } as const);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function MatchBadge({
  match,
}: {
  match: {
    companyId: number | null;
    alreadyImported: boolean;
    companyHasJobSource: boolean;
    matchedJobStatus: string | null;
  };
}) {
  if (match.alreadyImported) {
    return (
      <span className="text-xs px-pad-1-5 py-pad-0-5 bg-green-100 text-green-700">
        Imported{match.matchedJobStatus ? ` · ${match.matchedJobStatus}` : ""}
      </span>
    );
  }
  if (match.companyId && match.companyHasJobSource) {
    return (
      <span className="text-xs px-pad-1-5 py-pad-0-5 bg-blue-100 text-blue-700">
        Has ATS source
      </span>
    );
  }
  if (match.companyId) {
    return (
      <span className="text-xs px-pad-1-5 py-pad-0-5 bg-amber-100 text-amber-700">
        Company known, no ATS
      </span>
    );
  }
  return (
    <span className="text-xs px-pad-1-5 py-pad-0-5 bg-red-100 text-red-700">Unknown company</span>
  );
}

export default function TechNLJobBoardImport() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const refreshed =
    fetcher.data && "intent" in fetcher.data && fetcher.data.intent === "refresh"
      ? fetcher.data
      : null;

  const jobs = refreshed?.success ? refreshed.jobs : loaderData.jobs;
  const fetchedAt = refreshed?.success ? refreshed.fetchedAt : loaderData.fetchedAt;
  const error = refreshed && !refreshed.success ? refreshed.error : loaderData.error;
  const isLoading = fetcher.state !== "idle";

  // Group by company for a clearer overview
  const byCompany = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const key = job.company || "(unknown)";
    const list = byCompany.get(key) ?? [];
    list.push(job);
    byCompany.set(key, list);
  }
  const companyGroups = Array.from(byCompany.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-gap-6">
        <div className="flex flex-wrap items-center gap-gap-4">
          <Link to="/manage/import/jobs" className="text-subtle hover:text-body">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-semibold text-heading">TechNL Job Board</h1>
          <div className="ml-auto flex items-center gap-gap-2">
            <a
              href="https://technl.ca/job-seekers/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-pad-3 py-pad-2 bg-tint hover:bg-harbour-200 text-heading text-sm font-medium transition-colors"
            >
              TechNL Board
            </a>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="refresh" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-pad-4 py-pad-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </fetcher.Form>
          </div>
        </div>

        <div className="bg-surface border border-line p-pad-4 text-sm text-body rounded-panel">
          <p>
            Read-only view of the live{" "}
            <a
              href="https://technl.ca/?feed=job_feed"
              target="_blank"
              rel="noopener noreferrer"
              className="text-body hover:underline"
            >
              technl.ca job feed
            </a>
            . Use this to spot postings from companies that don&apos;t yet have a direct ATS
            importer set up. Approved jobs should be added with{" "}
            <code className="bg-soft px-pad-1">createJob</code> via the MCP, keeping{" "}
            <code className="bg-soft px-pad-1">url</code> pointed at the technl.ca link.
          </p>
          <p className="mt-2 text-xs text-subtle">Last fetched {formatDate(fetchedAt)}</p>
        </div>

        {error && (
          <div className="p-pad-4 bg-red-50 border border-red-200">
            <p className="font-medium text-red-700">Failed to fetch feed</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {jobs.length === 0 && !error && (
          <div className="p-pad-8 border border-line bg-soft text-center">
            <p className="text-body">No jobs in the TechNL feed right now.</p>
          </div>
        )}

        {companyGroups.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-gap-4">
            <div className="p-pad-4 border border-line bg-surface text-center rounded-panel">
              <div className="text-3xl font-bold text-heading">{jobs.length}</div>
              <div className="text-sm text-muted">Total Jobs</div>
            </div>
            <div className="p-pad-4 border border-line bg-surface text-center rounded-panel">
              <div className="text-3xl font-bold text-heading">{companyGroups.length}</div>
              <div className="text-sm text-muted">Companies</div>
            </div>
            <div className="p-pad-4 border border-amber-200 bg-amber-50 text-center">
              <div className="text-3xl font-bold text-amber-700">
                {jobs.filter((j) => j.match.companyId && !j.match.companyHasJobSource).length}
              </div>
              <div className="text-sm text-amber-700">Known Co · No ATS</div>
            </div>
            <div className="p-pad-4 border border-red-200 bg-red-50 text-center">
              <div className="text-3xl font-bold text-red-700">
                {jobs.filter((j) => !j.match.companyId).length}
              </div>
              <div className="text-sm text-red-700">Unknown Companies</div>
            </div>
          </div>
        )}

        {companyGroups.map(([companyName, group]) => {
          const sample = group[0];
          return (
            <div
              key={companyName}
              className="border border-line bg-surface overflow-x-auto rounded-panel"
            >
              <div className="px-pad-4 py-pad-3 bg-soft border-b border-line flex flex-wrap items-center gap-gap-3">
                <h2 className="font-medium text-heading">
                  {companyName}
                  <span className="ml-2 text-xs text-subtle">
                    ({group.length} {group.length === 1 ? "job" : "jobs"})
                  </span>
                </h2>
                {sample.match.companySlug ? (
                  <Link
                    to={`/directory/companies/${sample.match.companySlug}`}
                    className="text-xs text-body hover:underline"
                  >
                    Company page
                  </Link>
                ) : (
                  <span className="text-xs text-red-600">
                    Not in directory — consider createCompany via MCP
                  </span>
                )}
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
                      Type
                    </th>
                    <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                      Salary
                    </th>
                    <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                      Posted
                    </th>
                    <th className="px-pad-4 py-pad-2 text-left text-sm font-medium text-body">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-harbour-100">
                  {group.map((job) => (
                    <tr key={job.link} className="hover:bg-soft align-top">
                      <td className="px-pad-4 py-pad-3">
                        <div className="flex flex-col gap-gap-1">
                          <a
                            href={job.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-body hover:underline"
                          >
                            {job.title}
                          </a>
                          {job.descriptionText && (
                            <details className="w-full">
                              <summary className="cursor-pointer text-xs text-muted hover:text-heading">
                                View posting text
                              </summary>
                              <pre className="mt-2 p-pad-2 text-xs text-body bg-soft border border-line whitespace-pre-wrap break-words font-mono">
                                {job.descriptionText}
                              </pre>
                            </details>
                          )}
                        </div>
                      </td>
                      <td className="px-pad-4 py-pad-3 text-sm text-muted">
                        {job.location || "—"}
                      </td>
                      <td className="px-pad-4 py-pad-3 text-sm text-muted">{job.jobType || "—"}</td>
                      <td className="px-pad-4 py-pad-3 text-sm text-muted">{job.salary || "—"}</td>
                      <td className="px-pad-4 py-pad-3 text-sm text-subtle">
                        {formatDate(job.postedAt)}
                      </td>
                      <td className="px-pad-4 py-pad-3">
                        <MatchBadge match={job.match} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
