import type { Route } from "./+types/jobs.search";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  searchIndeed,
  searchLinkedIn,
  type IndeedSearchResult,
  type LinkedInSearchResult,
} from "~/lib/job-search.server";
import { createJob } from "~/lib/jobs.server";
import { getCompanyByName } from "~/lib/companies.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Job Search - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "search") {
    const source = formData.get("source") as string;
    const query = (formData.get("query") as string)?.trim() || undefined;
    const location = (formData.get("location") as string)?.trim() || "St. John's, NL";

    try {
      if (source === "indeed") {
        const results = await searchIndeed({ query, location, limit: 50 });
        return { intent: "search", source: "indeed", results, error: null };
      }
      if (source === "linkedin") {
        const results = await searchLinkedIn({ query, location, limit: 50 });
        return { intent: "search", source: "linkedin", results, error: null };
      }
      return { intent: "search", error: "Unknown source" };
    } catch (e) {
      return {
        intent: "search",
        source,
        results: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  if (intent === "import") {
    const title = (formData.get("title") as string)?.trim();
    const companyName = (formData.get("companyName") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const url = (formData.get("url") as string)?.trim();
    const location = (formData.get("location") as string)?.trim();
    const salary = (formData.get("salary") as string)?.trim();
    const isRemote = formData.get("isRemote") === "true";

    if (!title || !url) {
      return { intent: "import", error: "Title and URL are required" };
    }

    let companyId: number | null = null;
    if (companyName) {
      const company = await getCompanyByName(companyName);
      if (company) companyId = company.id;
    }

    const job = await createJob({
      title,
      description: description || title,
      url,
      companyId,
      location: location || null,
      salaryRange: salary || null,
      workplaceType: isRemote ? "remote" : null,
    });

    return {
      intent: "import",
      success: true,
      jobId: job.id,
      title: job.title,
      matched: companyId ? true : false,
    };
  }

  return { error: "Unknown intent" };
}

type SearchResult = IndeedSearchResult | LinkedInSearchResult;

function isIndeedResult(r: SearchResult): r is IndeedSearchResult {
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
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            to="/manage/import/jobs"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Job Import Sources
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-harbour-700">Job Board Search</h1>
          <p className="text-harbour-400 text-sm mt-1">
            Search Indeed and LinkedIn for St. John's tech jobs. Import individually after review.
          </p>
        </div>

        <fetcher.Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="search" />
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-harbour-600">Source</label>
              <select
                name="source"
                value={source}
                onChange={(e) => setSource(e.target.value as "indeed" | "linkedin")}
                className="px-3 py-2 border border-harbour-200 text-sm"
              >
                <option value="indeed">Indeed</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>
            <div className="flex-1 flex flex-col gap-1 min-w-48">
              <label className="text-sm text-harbour-600">Keywords (optional)</label>
              <input
                name="query"
                type="text"
                placeholder="e.g. software developer"
                className="px-3 py-2 border border-harbour-200 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-harbour-600">Location</label>
              <input
                name="location"
                type="text"
                defaultValue="St. John's, NL"
                className="px-3 py-2 border border-harbour-200 text-sm w-48"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-4 py-2 bg-harbour-600 text-white hover:bg-harbour-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>
        </fetcher.Form>

        {fetcher.data && "error" in fetcher.data && fetcher.data.error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
            {fetcher.data.error}
          </div>
        )}

        {fetcher.data && "intent" in fetcher.data && fetcher.data.intent === "import" && "success" in fetcher.data && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm">
            Imported "{fetcher.data.title}" (Job #{fetcher.data.jobId})
            {fetcher.data.matched ? "" : " — no company match, review needed"}
          </div>
        )}

        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-harbour-500">{results.length} results</p>
            {results.map((r) => (
              <div key={r.id} className="border border-harbour-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-harbour-700 hover:text-harbour-600"
                      >
                        {r.title}
                      </a>
                      {r.salary && (
                        <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700">
                          {r.salary}
                        </span>
                      )}
                      {"isRemote" in r && r.isRemote && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700">
                          Remote
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-harbour-500 mt-1">
                      {r.companyName && <span className="font-medium">{r.companyName}</span>}
                      {r.companyName && r.location && " \u2022 "}
                      {r.location}
                      {r.datePosted && ` \u2022 ${r.datePosted}`}
                    </div>
                    {isIndeedResult(r) && expandedId === r.id && (
                      <div className="mt-3 text-sm text-harbour-600 max-h-64 overflow-y-auto border-t border-harbour-100 pt-3">
                        {r.description.slice(0, 1000)}
                        {r.description.length > 1000 ? "..." : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {isIndeedResult(r) && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        className="text-xs px-2 py-1 border border-harbour-200 text-harbour-500 hover:text-harbour-700"
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
                      <input type="hidden" name="url" value={r.url} />
                      <input type="hidden" name="location" value={r.location} />
                      <input type="hidden" name="salary" value={r.salary ?? ""} />
                      <input
                        type="hidden"
                        name="isRemote"
                        value={String("isRemote" in r && r.isRemote)}
                      />
                      <button
                        type="submit"
                        className="text-xs px-2 py-1 bg-harbour-600 text-white hover:bg-harbour-700"
                      >
                        Import
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
