import type { Route } from "./+types/jobs.technl";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { fetchTechNLJobsWithMatches } from "~/lib/technl-jobs.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "TechNL Job Board - Import - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  try {
    const result = await fetchTechNLJobsWithMatches();
    return { ...result, error: null as string | null };
  } catch (err) {
    return {
      jobs: [],
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  // The page intentionally has no DB-mutating actions. The "Refresh" button
  // re-runs the loader, which re-fetches the live RSS feed; we don't store
  // anything on our side because TechNL is the source of truth.
  const formData = await request.formData();
  if (formData.get("intent") === "refresh") {
    try {
      const result = await fetchTechNLJobsWithMatches();
      return { intent: "refresh", success: true, ...result } as const;
    } catch (err) {
      return {
        intent: "refresh",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      } as const;
    }
  }
  return { success: false, error: "Unknown action" } as const;
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
      <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700">
        Imported{match.matchedJobStatus ? ` · ${match.matchedJobStatus}` : ""}
      </span>
    );
  }
  if (match.companyId && match.companyHasJobSource) {
    return (
      <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700">
        Has ATS source
      </span>
    );
  }
  if (match.companyId) {
    return (
      <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700">
        Company known, no ATS
      </span>
    );
  }
  return (
    <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700">
      Unknown company
    </span>
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
  const companyGroups = Array.from(byCompany.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to="/manage/import/jobs"
            className="text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back
          </Link>
          <h1 className="text-2xl font-semibold text-harbour-700">TechNL Job Board</h1>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="https://technl.ca/job-seekers/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-harbour-100 hover:bg-harbour-200 text-harbour-700 text-sm font-medium transition-colors"
            >
              TechNL Board
            </a>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="refresh" />
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </fetcher.Form>
          </div>
        </div>

        <div className="bg-white border border-harbour-200 p-4 text-sm text-harbour-600">
          <p>
            Read-only view of the live{" "}
            <a
              href="https://technl.ca/?feed=job_feed"
              target="_blank"
              rel="noopener noreferrer"
              className="text-harbour-600 hover:underline"
            >
              technl.ca job feed
            </a>
            . Use this to spot postings from companies that don&apos;t yet have a
            direct ATS importer set up. Approved jobs should be added with{" "}
            <code className="bg-harbour-50 px-1">createJob</code> via the MCP,
            keeping <code className="bg-harbour-50 px-1">url</code> pointed at
            the technl.ca link.
          </p>
          <p className="mt-2 text-xs text-harbour-400">
            Last fetched {formatDate(fetchedAt)}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200">
            <p className="font-medium text-red-700">Failed to fetch feed</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {jobs.length === 0 && !error && (
          <div className="p-8 border border-harbour-200 bg-harbour-50 text-center">
            <p className="text-harbour-600">No jobs in the TechNL feed right now.</p>
          </div>
        )}

        {companyGroups.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 border border-harbour-200 bg-white text-center">
              <div className="text-3xl font-bold text-harbour-700">{jobs.length}</div>
              <div className="text-sm text-harbour-500">Total Jobs</div>
            </div>
            <div className="p-4 border border-harbour-200 bg-white text-center">
              <div className="text-3xl font-bold text-harbour-700">
                {companyGroups.length}
              </div>
              <div className="text-sm text-harbour-500">Companies</div>
            </div>
            <div className="p-4 border border-amber-200 bg-amber-50 text-center">
              <div className="text-3xl font-bold text-amber-700">
                {jobs.filter((j) => j.match.companyId && !j.match.companyHasJobSource).length}
              </div>
              <div className="text-sm text-amber-700">Known Co · No ATS</div>
            </div>
            <div className="p-4 border border-red-200 bg-red-50 text-center">
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
              className="border border-harbour-200 bg-white overflow-x-auto"
            >
              <div className="px-4 py-3 bg-harbour-50 border-b border-harbour-200 flex flex-wrap items-center gap-3">
                <h2 className="font-medium text-harbour-700">
                  {companyName}
                  <span className="ml-2 text-xs text-harbour-400">
                    ({group.length} {group.length === 1 ? "job" : "jobs"})
                  </span>
                </h2>
                {sample.match.companySlug ? (
                  <Link
                    to={`/directory/companies/${sample.match.companySlug}`}
                    className="text-xs text-harbour-600 hover:underline"
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
                <thead className="bg-harbour-50 border-b border-harbour-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">
                      Title
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">
                      Location
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">
                      Salary
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">
                      Posted
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-harbour-600">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-harbour-100">
                  {group.map((job) => (
                    <tr key={job.link} className="hover:bg-harbour-50 align-top">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <a
                            href={job.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-harbour-600 hover:underline"
                          >
                            {job.title}
                          </a>
                          {job.descriptionText && (
                            <details className="w-full">
                              <summary className="cursor-pointer text-xs text-harbour-500 hover:text-harbour-700">
                                View posting text
                              </summary>
                              <pre className="mt-2 p-2 text-xs text-harbour-600 bg-harbour-50 border border-harbour-200 whitespace-pre-wrap break-words font-mono">
                                {job.descriptionText}
                              </pre>
                            </details>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-harbour-500">
                        {job.location || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-harbour-500">
                        {job.jobType || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-harbour-500">
                        {job.salary || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-harbour-400">
                        {formatDate(job.postedAt)}
                      </td>
                      <td className="px-4 py-3">
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
