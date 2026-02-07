import type { Route } from "./+types/index";
import { createCookie, data, Form, Link, redirect, useLoaderData, useSearchParams } from "react-router";
import { getJobsGroupedByCompany, type CompanyWithJobs } from "~/lib/jobs.server";
import { getOptionalUser } from "~/lib/session.server";
import { SearchInput } from "~/components/SearchInput";
import { format } from "date-fns";
import { BaseMultiSelect } from "~/components/BaseMultiSelect";

const workplaceTypeOptions = ["remote", "hybrid", "onsite", "unknown"] as const;
type WorkplaceFilterType = (typeof workplaceTypeOptions)[number];
const workplaceTypeLabels: Record<WorkplaceFilterType, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
  unknown: "Unspecified",
};
const workplaceTypeFilterOptions = workplaceTypeOptions.map((value) => ({
  value,
  label: workplaceTypeLabels[value],
}));
const showNonTechnicalCookie = createCookie("__jobs_show_non_technical", {
  path: "/jobs",
  sameSite: "lax",
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
});

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Jobs - siliconharbour.dev" },
    { name: "description", content: "Tech job opportunities in St. John's" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const technicalParam = url.searchParams.get("technical");
  const cookieHeader = request.headers.get("Cookie");
  const cookiePref = await showNonTechnicalCookie.parse(cookieHeader);
  const showNonTechnical =
    technicalParam === "false" ? true : technicalParam === "true" ? false : cookiePref === "1";
  const rawSelectedWorkplaceTypes = (url.searchParams.get("workplace") || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is WorkplaceFilterType =>
      workplaceTypeOptions.includes(value as WorkplaceFilterType),
    );
  const selectedWorkplaceTypes =
    rawSelectedWorkplaceTypes.length > 0
      ? rawSelectedWorkplaceTypes
      : [...workplaceTypeOptions];

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  let companiesWithJobs = await getJobsGroupedByCompany({ includeNonTechnical: showNonTechnical });

  // Filter by workplace type
  companiesWithJobs = companiesWithJobs
    .map((cwj) => ({
      ...cwj,
      jobs: cwj.jobs.filter((job) => {
        const workplaceType = (job.workplaceType ?? "unknown") as WorkplaceFilterType;
        return selectedWorkplaceTypes.includes(workplaceType);
      }),
    }))
    .filter((cwj) => cwj.jobs.length > 0);
  
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

  const shouldPersistFromQuery = technicalParam === "false" || technicalParam === "true";
  const setCookieHeader = shouldPersistFromQuery
    ? await showNonTechnicalCookie.serialize(technicalParam === "false" ? "1" : "0")
    : null;

  return data({
    companiesWithJobs,
    totalJobs,
    searchQuery,
    isAdmin,
    showNonTechnical,
    selectedWorkplaceTypes,
  }, setCookieHeader ? { headers: { "Set-Cookie": setCookieHeader } } : undefined);
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent !== "set-non-technical-pref") {
    return redirect("/jobs");
  }

  const enabled = formData.get("enabled") === "true";
  const rawRedirectTo = String(formData.get("redirectTo") || "/jobs");
  const safeRedirectTo = rawRedirectTo.startsWith("/jobs") ? rawRedirectTo : "/jobs";

  return redirect(safeRedirectTo, {
    headers: {
      "Set-Cookie": await showNonTechnicalCookie.serialize(enabled ? "1" : "0"),
    },
  });
}

export default function JobsIndex() {
  const { companiesWithJobs, totalJobs, searchQuery, isAdmin, showNonTechnical, selectedWorkplaceTypes } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const redirectParams = new URLSearchParams(searchParams);
  redirectParams.delete("technical");
  const redirectTo = redirectParams.toString() ? `/jobs?${redirectParams.toString()}` : "/jobs";

  const handleShowNonTechnicalChange = (checked: boolean) => {
    const form = document.getElementById("jobs-non-technical-form") as HTMLFormElement | null;
    if (!form) {
      return;
    }
    const enabledInput = form.elements.namedItem("enabled") as HTMLInputElement | null;
    if (!enabledInput) {
      return;
    }
    enabledInput.value = checked ? "true" : "false";
    form.requestSubmit();
  };

  const handleWorkplaceTypeChange = (nextSelected: string[]) => {
    const validSelection = nextSelected.filter((value): value is WorkplaceFilterType =>
      workplaceTypeOptions.includes(value as WorkplaceFilterType),
    );
    if (validSelection.length === 0) {
      return;
    }

    const newParams = new URLSearchParams(searchParams);
    newParams.delete("workplace");

    if (validSelection.length !== workplaceTypeOptions.length) {
      newParams.set("workplace", validSelection.join(","));
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
          <div className="flex flex-col gap-3">
            <div className="flex-1 min-w-[200px]">
              <SearchInput
                placeholder="Search jobs..."
                preserveParams={["technical", "workplace"]}
              />
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              {/* Show non-technical checkbox */}
              <Form id="jobs-non-technical-form" method="post">
                <input type="hidden" name="intent" value="set-non-technical-pref" />
                <input type="hidden" name="enabled" value={showNonTechnical ? "true" : "false"} />
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <label className="flex items-center gap-2 text-sm text-harbour-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showNonTechnical}
                    onChange={(e) => handleShowNonTechnicalChange(e.target.checked)}
                    className="w-4 h-4 text-harbour-600 border-harbour-300 focus:ring-harbour-500"
                  />
                  Show non-technical roles
                </label>
              </Form>

              <div className="flex items-center gap-2 md:justify-end">
                <span className="text-sm text-harbour-500 whitespace-nowrap">Workplace:</span>
                <div className="min-w-[240px] max-w-sm w-full">
                <BaseMultiSelect
                  name="workplaceType"
                  options={workplaceTypeFilterOptions}
                  selectedValues={selectedWorkplaceTypes}
                  onChange={handleWorkplaceTypeChange}
                  placeholder="Workplace types"
                  showSelectedChipsInTrigger
                  showSelectedChipsBelow={false}
                />
                </div>
              </div>
            </div>
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
              <CompanyJobCard key={cwj.company.id} data={cwj} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CompanyJobCard({ data, isAdmin }: { data: CompanyWithJobs; isAdmin: boolean }) {
  const { company, jobs } = data;
  const importSourceId = jobs.find((job) => job.sourceId)?.sourceId;

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
        <div className="flex items-center gap-3">
          {isAdmin && importSourceId && (
            <Link
              to={`/manage/import/jobs/${importSourceId}`}
              className="text-sm text-harbour-500 hover:text-harbour-700 hidden sm:flex items-center"
              title="Open import sync page"
              aria-label="Open import sync page"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M11.983 4.5a1.8 1.8 0 011.77 1.48l.09.49a6.96 6.96 0 011.39.8l.47-.16a1.8 1.8 0 012 .73l.8 1.38a1.8 1.8 0 01-.23 2.12l-.34.38c.07.47.07.95 0 1.42l.34.38a1.8 1.8 0 01.23 2.12l-.8 1.38a1.8 1.8 0 01-2 .73l-.47-.16a6.96 6.96 0 01-1.39.8l-.09.49a1.8 1.8 0 01-1.77 1.48h-1.6a1.8 1.8 0 01-1.77-1.48l-.09-.49a6.96 6.96 0 01-1.39-.8l-.47.16a1.8 1.8 0 01-2-.73l-.8-1.38a1.8 1.8 0 01.23-2.12l.34-.38a6.08 6.08 0 010-1.42l-.34-.38a1.8 1.8 0 01-.23-2.12l.8-1.38a1.8 1.8 0 012-.73l.47.16a6.96 6.96 0 011.39-.8l.09-.49A1.8 1.8 0 0110.383 4.5h1.6z"
                />
                <circle cx="11.183" cy="12" r="2.8" strokeWidth="2" />
              </svg>
            </Link>
          )}
          {(company.careersUrl || company.website) && (
            <a
              href={company.careersUrl || company.website!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-harbour-500 hover:text-harbour-700 hidden sm:block"
            >
              {company.careersUrl ? "Careers" : "Website"}
            </a>
          )}
        </div>
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
                {job.postedAt ? (
                  <span>Posted {format(job.postedAt, "MMM d, yyyy")}</span>
                ) : job.firstSeenAt ? (
                  <span>First seen {format(job.firstSeenAt, "MMM d, yyyy")}</span>
                ) : null}
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
              {job.workplaceType === "onsite" && (
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700">Onsite</span>
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
