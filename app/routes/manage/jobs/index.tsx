import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getPaginatedJobs } from "~/lib/jobs.server";
import { SearchInput } from "~/components/SearchInput";
import { format } from "date-fns";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Jobs - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const { items: jobs } = await getPaginatedJobs(100, 0, searchQuery);
  return { jobs, searchQuery };
}

export default function ManageJobsIndex() {
  const { jobs } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">Jobs</h1>
          <Link
            to="/manage/jobs/new"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            New Job
          </Link>
        </div>

        <SearchInput placeholder="Search jobs..." />

        {jobs.length === 0 ? (
          <div className="text-center p-12 text-harbour-400">
            No job listings yet. Create your first job to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-4 p-4 bg-white border border-harbour-200"
              >
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium truncate text-harbour-700">{job.title}</h2>
                    {job.remote && (
                      <span className="text-xs px-2 py-0.5 bg-harbour-100 text-harbour-600">Remote</span>
                    )}
                  </div>
                  <p className="text-sm text-harbour-400">
                    {job.companyName && `${job.companyName} - `}
                    Posted {format(job.postedAt, "MMM d, yyyy")}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/manage/jobs/${job.id}`}
                    className="px-3 py-1.5 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/manage/jobs/${job.id}/delete`}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <Link
            to="/manage"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
