import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/jobs.search";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import type {
  EnrichedIndeedSearchResult,
  EnrichedLinkedInSearchResult,
} from "~/lib/job-search.server";
import { JOB_SEARCH_TERMS } from "~/lib/job-search";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Job Search - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "search") {
    const source = form.get("source");
    const operation =
      source === "indeed"
        ? operationCatalog.jobSearchIndeed
        : source === "linkedin"
          ? operationCatalog.jobSearchLinkedIn
          : null;
    if (!operation) return { intent: "search", error: "Unknown source" } as const;
    const result = await runAdminOperation(request, operation, {
      query: form.get("query") || undefined,
      location: form.get("location") || undefined,
      limit: 50,
      confirm: true,
    });
    return result.ok
      ? ({ intent: "search", source, results: result.data, error: null } as const)
      : ({ intent: "search", source, results: [], error: result.error } as const);
  }
  if (intent === "import") {
    const result = await runAdminOperation(request, operationCatalog.jobSearchImport, {
      title: form.get("title"),
      companyName: form.get("companyName") ?? null,
      description: form.get("description") ?? null,
      url: form.get("url"),
      location: form.get("location") ?? null,
      salary: form.get("salary") ?? null,
      isRemote: form.get("isRemote") === "true",
    });
    return result.ok
      ? ({
          intent: "import",
          success: true,
          jobId: result.data.id,
          title: result.data.title,
          matched: Boolean(result.data.companyId),
        } as const)
      : ({ intent: "import", error: result.error } as const);
  }
  return { error: "Unknown intent" } as const;
}

type SearchResult = EnrichedIndeedSearchResult | EnrichedLinkedInSearchResult;

function isIndeedResult(r: SearchResult): r is EnrichedIndeedSearchResult {
  return "descriptionHtml" in r;
}

export default function JobSearchPage() {
  const fetcher = useFetcher<typeof action>();
  const [source, setSource] = useState<"indeed" | "linkedin">("indeed");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isSearching = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "search";
  const results =
    fetcher.data && "results" in fetcher.data ? (fetcher.data.results as SearchResult[]) : [];

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/import/jobs" className="text-sm text-subtle hover:text-body">
            &larr; Back to Job Import Sources
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-heading">Job Board Search</h1>
          <p className="text-subtle text-sm mt-1">
            Search Indeed and LinkedIn for St. John's tech jobs. Import individually after review.
          </p>
        </div>

        <fetcher.Form method="post" className="flex flex-col gap-gap-3">
          <input type="hidden" name="intent" value="search" />
          <div className="flex flex-wrap gap-gap-3 items-end">
            <div className="flex flex-col gap-gap-1">
              <label className="text-sm text-body">Source</label>
              <select
                name="source"
                value={source}
                onChange={(e) => setSource(e.target.value as "indeed" | "linkedin")}
                className="px-pad-3 py-pad-2 border border-line text-sm"
              >
                <option value="indeed">Indeed</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>
            <div className="flex-1 flex flex-col gap-gap-1 min-w-48">
              <label className="text-sm text-body">Search Term</label>
              <select name="query" className="px-pad-3 py-pad-2 border border-line text-sm">
                <option value="">All jobs (no filter)</option>
                {JOB_SEARCH_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-gap-1">
              <label className="text-sm text-body">Location</label>
              <input
                name="location"
                type="text"
                defaultValue="St. John's, NL"
                className="px-pad-3 py-pad-2 border border-line text-sm w-48"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-pad-4 py-pad-2 bg-primary text-white hover:bg-primary-hover text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>
        </fetcher.Form>

        {fetcher.data && "error" in fetcher.data && fetcher.data.error && (
          <div className="p-pad-3 bg-red-50 border border-red-200 text-red-700 text-sm">
            {fetcher.data.error}
          </div>
        )}

        {fetcher.data &&
          "intent" in fetcher.data &&
          fetcher.data.intent === "import" &&
          "success" in fetcher.data && (
            <div className="p-pad-3 bg-green-50 border border-green-200 text-green-700 text-sm">
              Imported "{fetcher.data.title}" (Job #{fetcher.data.jobId})
              {fetcher.data.matched ? "" : " — no company match, review needed"}
            </div>
          )}

        {results.length > 0 && (
          <div className="flex flex-col gap-gap-2">
            <p className="text-sm text-muted">{results.length} results</p>
            {results.map((r) => (
              <div key={r.id} className="border border-line bg-surface p-pad-4 rounded-panel">
                <div className="flex items-start justify-between gap-gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-gap-2 flex-wrap">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-heading hover:text-body"
                      >
                        {r.title}
                      </a>
                      {r.salary && (
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-green-50 text-green-700">
                          {r.salary}
                        </span>
                      )}
                      {"isRemote" in r && r.isRemote && (
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-purple-50 text-purple-700">
                          Remote
                        </span>
                      )}
                      {r.match.companyId && (
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-green-50 text-green-700">
                          Known company
                        </span>
                      )}
                      {r.match.jobSources.map((source) => (
                        <span
                          key={source.id}
                          className="text-xs px-pad-1-5 py-pad-0-5 bg-soft text-heading"
                        >
                          {source.sourceType} source
                        </span>
                      ))}
                      {r.match.likelyDuplicate && (
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-amber-100 text-amber-800">
                          Existing: {r.match.existingJobStatus}
                        </span>
                      )}
                      {r.discoveredSource && (
                        <span className="text-xs px-pad-1-5 py-pad-0-5 bg-blue-50 text-blue-700">
                          {r.discoveredSource.sourceType} detected ({r.discoveredSource.confidence})
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted mt-1">
                      {r.companyName && <span className="font-medium">{r.companyName}</span>}
                      {r.companyName && r.location && " \u2022 "}
                      {r.location}
                      {r.datePosted && ` \u2022 ${r.datePosted}`}
                    </div>
                    {isIndeedResult(r) && expandedId === r.id && (
                      <div className="mt-3 text-sm text-body max-h-64 overflow-y-auto border-t border-harbour-100 pt-pad-3">
                        {r.description.slice(0, 1000)}
                        {r.description.length > 1000 ? "..." : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-gap-2 shrink-0">
                    {isIndeedResult(r) && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        className="text-xs px-pad-2 py-pad-1 border border-line text-muted hover:text-heading"
                      >
                        {expandedId === r.id ? "Hide" : "Preview"}
                      </button>
                    )}
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="import" />
                      <input type="hidden" name="title" value={r.title} />
                      <input type="hidden" name="companyName" value={r.companyName ?? ""} />
                      <input
                        type="hidden"
                        name="description"
                        value={isIndeedResult(r) ? r.description : r.title}
                      />
                      <input
                        type="hidden"
                        name="url"
                        value={
                          isIndeedResult(r) && r.discoveredSource && r.directUrl
                            ? r.directUrl
                            : r.url
                        }
                      />
                      <input type="hidden" name="location" value={r.location} />
                      <input type="hidden" name="salary" value={r.salary ?? ""} />
                      <input
                        type="hidden"
                        name="isRemote"
                        value={String("isRemote" in r && r.isRemote)}
                      />
                      <button
                        type="submit"
                        disabled={r.match.likelyDuplicate}
                        className="text-xs px-pad-2 py-pad-1 bg-primary text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-harbour-200 disabled:text-heading"
                      >
                        {r.match.likelyDuplicate ? "Indexed" : "Import"}
                      </button>
                    </fetcher.Form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
