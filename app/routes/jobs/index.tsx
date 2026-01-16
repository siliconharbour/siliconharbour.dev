import type { Route } from "./+types/index";
import { useLoaderData } from "react-router";
import { getPaginatedJobs } from "~/lib/jobs.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Jobs - siliconharbour.dev" },
    { name: "description", content: "Tech job opportunities in St. John's" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  const { items: jobs, total } = await getPaginatedJobs(limit, offset, searchQuery);
  
  return { jobs, total, limit, offset, searchQuery };
}

export default function JobsIndex() {
  const { jobs, total, limit, offset, searchQuery } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">Jobs</h1>
            <p className="text-harbour-500">Tech job opportunities in the community</p>
          </div>
          
          {/* Search - only show if pagination is needed */}
          {(total > limit || searchQuery) && (
            <>
              <SearchInput placeholder="Search jobs..." />
              
              {/* Result count */}
              {searchQuery && (
                <p className="text-sm text-harbour-500">
                  {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
                </p>
              )}
            </>
          )}
        </div>

        {jobs.length === 0 ? (
          <p className="text-harbour-400">
            {searchQuery ? "No jobs match your search." : "No job listings at the moment."}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {jobs.map((job) => (
              <a
                key={job.id}
                href={`/jobs/${job.slug}`}
                className="group flex flex-col gap-2 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all no-underline"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h2 className="font-semibold text-harbour-700 group-hover:text-harbour-600">
                    {job.title}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {job.remote && (
                      <span className="text-xs px-2 py-1 bg-harbour-100 text-harbour-600">
                        Remote
                      </span>
                    )}
                    {job.salaryRange && (
                      <span className="text-xs px-2 py-1 bg-harbour-100 text-harbour-600">
                        {job.salaryRange}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-harbour-500">
                  {job.companyName && <span>{job.companyName}</span>}
                  {job.location && <span>{job.location}</span>}
                  <span>Posted {format(job.postedAt, "MMM d, yyyy")}</span>
                </div>
              </a>
            ))}
          </div>
        )}
        
        <Pagination total={total} limit={limit} offset={offset} />
      </div>
    </div>
  );
}
