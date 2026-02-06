import type { Route } from "./+types/jobs";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllImportSources, syncJobs } from "~/lib/job-importers/sync.server";
import { getAllCompanies } from "~/lib/companies.server";
import { sourceTypeLabels } from "~/lib/job-importers/types";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Import Jobs - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  
  const [sources, companies] = await Promise.all([
    getAllImportSources(),
    getAllCompanies(true),
  ]);
  
  // Create a map of company id to company for easy lookup
  const companyMap = new Map(companies.map(c => [c.id, c]));
  
  // Enrich sources with company info
  const enrichedSources = sources.map(source => ({
    ...source,
    company: companyMap.get(source.companyId),
  }));
  
  return { sources: enrichedSources };
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
  if (!status) return <span className="text-slate-400">-</span>;
  
  const colors: Record<string, string> = {
    success: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800",
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || "bg-slate-100 text-slate-800"}`}>
      {status}
    </span>
  );
}

export default function ManageImportJobs() {
  const { sources } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  
  const isLoading = fetcher.state !== "idle";
  const syncResult = fetcher.data?.intent === "sync" ? fetcher.data : null;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">Job Import Sources</h1>
          <Link
            to="/manage/import/jobs/new"
            className="px-4 py-2 bg-harbour-500 hover:bg-harbour-600 text-white font-medium transition-colors"
          >
            Add Source
          </Link>
        </div>

        {syncResult && (
          <div className={`p-4 rounded ${syncResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
            {syncResult.success ? (
              <div>
                <p className="font-medium text-green-800">Sync completed</p>
                <p className="text-sm text-green-700">
                  Added: {syncResult.added}, Updated: {syncResult.updated}, 
                  Removed: {syncResult.removed}, Reactivated: {syncResult.reactivated}
                </p>
                <p className="text-sm text-green-700">Total active jobs: {syncResult.totalActive}</p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-red-800">Sync failed</p>
                <p className="text-sm text-red-700">{syncResult.error}</p>
              </div>
            )}
          </div>
        )}

        {sources.length === 0 ? (
          <div className="bg-slate-50 rounded-lg p-8 text-center">
            <p className="text-slate-600 mb-4">No job import sources configured yet.</p>
            <Link
              to="/manage/import/jobs/new"
              className="text-harbour-500 hover:text-harbour-600 underline"
            >
              Add your first source
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Company</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Source</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Identifier</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">Jobs</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Last Fetch</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sources.map((source) => (
                  <tr key={source.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {source.company ? (
                        <Link
                          to={`/directory/companies/${source.company.slug}`}
                          className="text-harbour-600 hover:underline font-medium"
                        >
                          {source.company.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {sourceTypeLabels[source.sourceType as keyof typeof sourceTypeLabels] || source.sourceType}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-500">
                      {source.sourceIdentifier}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-1 bg-harbour-100 text-harbour-700 rounded text-sm font-medium">
                        {source.activeJobCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
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
                            className="px-3 py-1 text-sm bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded transition-colors"
                          >
                            {isLoading ? "..." : "Sync"}
                          </button>
                        </fetcher.Form>
                        <Link
                          to={`/manage/import/jobs/${source.id}`}
                          className="px-3 py-1 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-sm text-slate-500">
          <p>
            Job import sources let you automatically pull job listings from company career pages.
            Supported platforms: Greenhouse, Ashby.
          </p>
        </div>
      </div>
    </div>
  );
}
