import { getAllImportSourcesWithStats, syncJobs } from "./sync.server";
export async function syncAllJobSources() {
  const sources = await getAllImportSourcesWithStats();
  const results = [];
  for (const source of sources)
    results.push({ sourceId: source.id, ...(await syncJobs(source.id)) });
  const succeeded = results.filter((result) => result.success);
  return {
    success: succeeded.length === sources.length,
    sourcesTotal: sources.length,
    sourcesSucceeded: succeeded.length,
    sourcesFailed: sources.length - succeeded.length,
    added: succeeded.reduce((sum, r) => sum + r.added, 0),
    updated: succeeded.reduce((sum, r) => sum + r.updated, 0),
    removed: succeeded.reduce((sum, r) => sum + r.removed, 0),
    reactivated: succeeded.reduce((sum, r) => sum + r.reactivated, 0),
    results,
    errors: results
      .filter((result) => !result.success)
      .map((result) => result.error ?? "Sync failed"),
  };
}
