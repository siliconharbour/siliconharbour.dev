import type { Route } from "./+types/index";
import { Link, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { getJobsGroupedByCompany } from "~/lib/jobs.server";
import { getOptionalUser } from "~/lib/session.server";
import { SearchInput } from "~/components/SearchInput";
import { CompanyJobCard, JobRow } from "~/components/JobCards";
import { BaseMultiSelect } from "~/components/BaseMultiSelect";
import { parseJobsQuery } from "~/lib/public-query.server";
import { jobsWorkplaceFilterOptions, type JobsWorkplaceFilterType } from "~/lib/public-query";
import { buildSeoMeta } from "~/lib/seo";

const workplaceTypeLabels: Record<JobsWorkplaceFilterType, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
  unknown: "Unspecified",
};
const workplaceTypeFilterOptions = jobsWorkplaceFilterOptions.map((value) => ({
  value,
  label: workplaceTypeLabels[value],
}));

export function meta({}: Route.MetaArgs) {
  return buildSeoMeta({
    title: "Tech Jobs in St. John's, NL",
    description:
      "Software engineering, development, and tech job opportunities in St. John's, Newfoundland. Find your next role in the local tech industry.",
    url: "/jobs",
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { searchQuery, showNonTechnical, selectedWorkplaceTypes, companySlugs, sort } =
    parseJobsQuery(url);

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  let companiesWithJobs = await getJobsGroupedByCompany({ includeNonTechnical: showNonTechnical });

  const companyOptions = companiesWithJobs
    .map(({ company }) => ({
      value: company.slug,
      label: company.name,
      imageSrc: company.logo ? `/images/${company.logo}` : undefined,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  for (const slug of companySlugs) {
    if (!companyOptions.some((option) => option.value === slug)) {
      companyOptions.push({
        value: slug,
        label: `Unavailable company (${slug})`,
        imageSrc: undefined,
      });
    }
  }
  if (companySlugs.length > 0) {
    companiesWithJobs = companiesWithJobs.filter(({ company }) =>
      companySlugs.includes(company.slug),
    );
  }

  // Filter by workplace type
  companiesWithJobs = companiesWithJobs
    .map((cwj) => ({
      ...cwj,
      jobs: cwj.jobs.filter((job) => {
        const workplaceType = (job.workplaceType ?? "unknown") as JobsWorkplaceFilterType;
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
            cwj.company.name.toLowerCase().includes(query),
        ),
      }))
      .filter((cwj) => cwj.jobs.length > 0);
  }

  const newestJobs = companiesWithJobs
    .flatMap(({ company, jobs }) => jobs.map((job) => ({ company, job })))
    .sort(
      (a, b) =>
        new Date(b.job.firstSeenAt ?? b.job.createdAt).getTime() -
          new Date(a.job.firstSeenAt ?? a.job.createdAt).getTime() || b.job.id - a.job.id,
    );

  const totalJobs = companiesWithJobs.reduce((sum, cwj) => sum + cwj.jobs.length, 0);
  return {
    companiesWithJobs,
    newestJobs,
    companyOptions,
    companySlugs,
    sort,
    totalJobs,
    searchQuery,
    isAdmin,
    showNonTechnical,
    selectedWorkplaceTypes,
  };
}

export default function JobsIndex() {
  const {
    companiesWithJobs,
    newestJobs,
    companyOptions,
    companySlugs,
    sort,
    totalJobs,
    searchQuery,
    isAdmin,
    showNonTechnical,
    selectedWorkplaceTypes,
  } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const navigateWithParams = (params: URLSearchParams) => {
    const query = params.toString().replaceAll("%7C", "|");
    navigate(query ? `?${query}` : "");
  };

  const handleSelectChange = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(name, value);
    else params.delete(name);
    navigateWithParams(params);
  };

  const handleShowNonTechnicalChange = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams);
    if (checked) {
      newParams.set("technical", "false");
    } else {
      newParams.delete("technical");
    }
    navigateWithParams(newParams);
  };

  const handleWorkplaceTypeChange = (nextSelected: string[]) => {
    const validSelection = nextSelected.filter((value): value is JobsWorkplaceFilterType =>
      jobsWorkplaceFilterOptions.includes(value as JobsWorkplaceFilterType),
    );
    if (validSelection.length === 0) {
      return;
    }

    const newParams = new URLSearchParams(searchParams);
    newParams.delete("workplace");

    if (validSelection.length !== jobsWorkplaceFilterOptions.length) {
      newParams.set("workplace", validSelection.join("|"));
    }

    navigateWithParams(newParams);
  };

  return (
    <div className="max-w-6xl mx-auto p-pad-4 py-pad-8">
      <div className="flex flex-col gap-gap-8">
        <div className="flex flex-col gap-gap-4">
          <div className="flex flex-col gap-gap-2">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-heading">Jobs</h1>
              {isAdmin && (
                <Link
                  to="/manage/jobs/new"
                  className="px-pad-3 py-pad-1-5 text-sm bg-primary text-white hover:bg-primary-hover transition-colors"
                >
                  + New Job
                </Link>
              )}
            </div>
            <p className="text-muted">Tech job opportunities in the community</p>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-gap-3">
            <div className="flex-1 min-w-[200px]">
              <SearchInput
                placeholder="Search jobs..."
                preserveParams={["technical", "workplace", "company", "sort"]}
              />
            </div>

            <div className="grid gap-gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-gap-1 text-sm text-body">
                Company
                <BaseMultiSelect
                  name="company"
                  className="flex-1"
                  options={companyOptions}
                  selectedValues={companySlugs}
                  onChange={(values) => handleSelectChange("company", values.join("|"))}
                  placeholder="All companies"
                  showSelectedChipsInTrigger
                  showSelectedChipsBelow={false}
                />
              </label>
              <label className="flex flex-col gap-gap-1 text-sm text-body">
                Sort
                <select
                  value={sort}
                  onChange={(e) =>
                    handleSelectChange("sort", e.target.value === "company" ? "" : e.target.value)
                  }
                  className="min-h-11 flex-1 px-pad-3 py-pad-2 bg-surface border border-line text-heading"
                >
                  <option value="company">Grouped by company</option>
                  <option value="newest">Newest first</option>
                </select>
              </label>
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-gap-3">
              {/* Show non-technical checkbox */}
              <label className="flex items-center gap-gap-2 text-sm text-body cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showNonTechnical}
                  onChange={(e) => handleShowNonTechnicalChange(e.target.checked)}
                  className="w-4 h-4 text-body border-harbour-300 focus:ring-harbour-500"
                />
                Show non-technical roles
              </label>

              <div className="flex items-center gap-gap-2 md:justify-end">
                <span className="text-sm text-muted whitespace-nowrap">Workplace:</span>
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
          {(searchQuery || companySlugs.length > 0 || sort === "newest") && (
            <p className="text-sm text-muted">
              {totalJobs} result{totalJobs !== 1 ? "s" : ""}
              {searchQuery && <> for "{searchQuery}"</>}
            </p>
          )}
        </div>

        {companiesWithJobs.length === 0 ? (
          <p className="text-subtle">No jobs match these filters.</p>
        ) : sort === "newest" ? (
          <div className="border border-line bg-surface divide-y divide-harbour-100 rounded-panel">
            {newestJobs.map(({ company, job }) => (
              <JobRow key={job.id} job={job} company={company} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-gap-6">
            {companiesWithJobs.map((cwj) => (
              <CompanyJobCard key={cwj.company.id} data={cwj} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
