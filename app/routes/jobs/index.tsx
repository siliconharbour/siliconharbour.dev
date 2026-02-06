import type { Route } from "./+types/index";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { getJobsGroupedByCompany, type CompanyWithJobs } from "~/lib/jobs.server";
import { getOptionalUser } from "~/lib/session.server";
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
  const searchQuery = url.searchParams.get("q") || "";
  const showNonTechnical = url.searchParams.get("showNonTechnical") === "true";

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  let companiesWithJobs = await getJobsGroupedByCompany({ includeNonTechnical: showNonTechnical });
  
  // Filter by search query if provided
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    companiesWithJobs = companiesWithJobs
      .map((cwj) => ({
        ...cwj,
        jobs: cwj.jobs.filter(
          (job) =>
            job.title.toLowerCase().includes(query) ||
            job.location?.toLowerCase().includes(query) ||
            job.department?.toLowerCase().includes(query) ||
            cwj.company.name.toLowerCase().includes(query)
        ),
      }))
      .filter((cwj) => cwj.jobs.length > 0);
  }

  const totalJobs = companiesWithJobs.reduce((sum, cwj) => sum + cwj.jobs.length, 0);

  return { companiesWithJobs, totalJobs, searchQuery, isAdmin, showNonTechnical };
}

export default function JobsIndex() {
  const { companiesWithJobs, totalJobs, searchQuery, isAdmin, showNonTechnical } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleShowNonTechnicalChange = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams);
    if (checked) {
      newParams.set("showNonTechnical", "true");
    } else {
      newParams.delete("showNonTechnical");
    }
    setSearchParams(newParams);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-harbour-700">Jobs</h1>
              {isAdmin && (
                <Link
                  to="/manage/jobs/new"
                  className="px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
                >
                  + New Job
                </Link>
              )}
            </div>
            <p className="text-harbour-500">Tech job opportunities in the community</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <SearchInput placeholder="Search jobs..." />
            </div>

            {/* Show non-technical checkbox */}
            <label className="flex items-center gap-2 text-sm text-harbour-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showNonTechnical}
                onChange={(e) => handleShowNonTechnicalChange(e.target.checked)}
                className="w-4 h-4 text-harbour-600 border-harbour-300 focus:ring-harbour-500"
              />
              Show non-technical roles
            </label>
          </div>

          {/* Result count */}
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {totalJobs} result{totalJobs !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>

        {companiesWithJobs.length === 0 ? (
          <p className="text-harbour-400">
            {searchQuery ? "No jobs match your search." : "No job listings at the moment."}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {companiesWithJobs.map((cwj) => (
              <CompanyJobCard key={cwj.company.id} data={cwj} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CompanyJobCard({ data }: { data: CompanyWithJobs }) {
  const { company, jobs } = data;

  return (
    <div className="ring-1 ring-harbour-200 bg-white overflow-hidden">
      {/* Company Header */}
      <div className="flex items-center gap-4 p-4 bg-harbour-50 border-b border-harbour-200">
        {company.logo ? (
          <Link to={`/directory/companies/${company.slug}`} className="flex-shrink-0">
            <div className="w-12 h-12 relative overflow-hidden bg-white border border-harbour-200">
              <img
                src={`/images/${company.logo}`}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          </Link>
        ) : (
          <Link to={`/directory/companies/${company.slug}`} className="flex-shrink-0">
            <div className="w-12 h-12 bg-harbour-200 flex items-center justify-center">
              <span className="text-lg font-medium text-harbour-500">
                {company.name.charAt(0)}
              </span>
            </div>
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <Link
            to={`/directory/companies/${company.slug}`}
            className="font-semibold text-harbour-700 hover:text-harbour-600 transition-colors"
          >
            {company.name}
          </Link>
          <div className="flex flex-wrap gap-x-3 text-sm text-harbour-500">
            {company.location && <span>{company.location}</span>}
            <span>
              {jobs.length} open position{jobs.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {company.website && (
          <a
            href={company.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-harbour-500 hover:text-harbour-700 hidden sm:block"
          >
            Website
          </a>
        )}
      </div>

      {/* Jobs List */}
      <div className="divide-y divide-harbour-100">
        {jobs.map((job) => (
          <a
            key={job.id}
            href={job.slug ? `/jobs/${job.slug}` : job.url || "#"}
            target={job.slug ? undefined : "_blank"}
            rel={job.slug ? undefined : "noopener noreferrer"}
            className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 hover:bg-harbour-50 transition-colors"
          >
            <div className="flex flex-col gap-1">
              <h3 className="font-medium text-harbour-700 group-hover:text-harbour-600">
                {job.title}
              </h3>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-harbour-500">
                {job.location && <span>{job.location}</span>}
                {job.department && <span>{job.department}</span>}
                {job.postedAt && <span>Posted {format(job.postedAt, "MMM d, yyyy")}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!job.isTechnical && (
                <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600">Non-technical</span>
              )}
              {job.workplaceType === "remote" && (
                <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700">Remote</span>
              )}
              {job.workplaceType === "hybrid" && (
                <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700">Hybrid</span>
              )}
              {job.salaryRange && (
                <span className="text-xs px-2 py-1 bg-harbour-100 text-harbour-600">
                  {job.salaryRange}
                </span>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
