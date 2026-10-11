import { Link } from "react-router";
import { format } from "date-fns";
import type { CompanyWithJobs } from "~/lib/jobs.server";

export function CompanyJobCard({ data, isAdmin }: { data: CompanyWithJobs; isAdmin: boolean }) {
  const { company, jobs } = data;
  const importSourceId = jobs.find((job) => job.sourceId)?.sourceId;

  return (
    <div className="card-surface overflow-hidden">
      {/* Company Header */}
      <div className="flex items-center gap-gap-4 p-pad-4 bg-soft border-b border-line">
        {company.logo ? (
          <Link to={`/directory/companies/${company.slug}`} className="flex-shrink-0">
            <div className="w-12 h-12 relative overflow-hidden bg-surface border border-line rounded-panel">
              <img
                src={`/images/${company.logo}`}
                alt={`${company.name} logo`}
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          </Link>
        ) : (
          <Link to={`/directory/companies/${company.slug}`} className="flex-shrink-0">
            <div className="w-12 h-12 bg-harbour-200 flex items-center justify-center">
              <span className="text-lg font-medium text-muted">{company.name.charAt(0)}</span>
            </div>
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <Link
            to={`/directory/companies/${company.slug}`}
            className="font-semibold text-heading hover:text-body transition-colors"
          >
            {company.name}
          </Link>
          <div className="flex flex-wrap gap-x-gap-3 text-sm text-muted">
            {company.location && <span>{company.location}</span>}
            <span>
              {jobs.length} open position{jobs.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-gap-3">
          {isAdmin && importSourceId && (
            <Link
              to={`/manage/import/jobs/${importSourceId}`}
              className="text-sm text-muted hover:text-heading hidden sm:flex items-center"
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
              className="text-sm text-muted hover:text-heading hidden sm:block"
            >
              {company.careersUrl ? "Careers" : "Website"}
            </a>
          )}
        </div>
      </div>

      {/* Jobs List */}
      <div className="divide-y divide-harbour-100">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}

export function JobRow({
  job,
  company,
}: {
  job: CompanyWithJobs["jobs"][number];
  company?: CompanyWithJobs["company"];
}) {
  return (
    <a
      href={job.url || `/jobs/${job.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-gap-2 p-pad-4 hover:bg-soft transition-colors"
    >
      <div className="flex flex-col gap-gap-1">
        {company && (
          <span className="flex items-center gap-gap-2 text-sm text-body">
            {company.logo && (
              <img
                src={`/images/${company.logo}`}
                alt=""
                className="w-6 h-6 shrink-0 object-contain"
              />
            )}
            {company.name}
          </span>
        )}
        <h3 className="font-medium text-heading group-hover:text-body">{job.title}</h3>
        <div className="flex flex-wrap gap-x-gap-3 gap-y-gap-1 text-sm text-muted">
          {job.location && <span>{job.location}</span>}
          {job.department && <span>{job.department}</span>}
          {company ? (
            <span>First seen {format(job.firstSeenAt ?? job.createdAt, "MMM d, yyyy")}</span>
          ) : job.postedAt ? (
            <span>Posted {format(job.postedAt, "MMM d, yyyy")}</span>
          ) : job.firstSeenAt ? (
            <span>First seen {format(job.firstSeenAt, "MMM d, yyyy")}</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-gap-2">
        {!job.isTechnical && (
          <span className="text-xs px-pad-1-5 py-pad-0-5 bg-slate-100 text-slate-600">
            Non-technical
          </span>
        )}
        {job.workplaceType === "remote" && (
          <span className="text-xs px-pad-1-5 py-pad-0-5 bg-purple-100 text-purple-700">
            Remote
          </span>
        )}
        {job.workplaceType === "hybrid" && (
          <span className="text-xs px-pad-1-5 py-pad-0-5 bg-orange-100 text-orange-700">
            Hybrid
          </span>
        )}
        {job.workplaceType === "onsite" && (
          <span className="text-xs px-pad-1-5 py-pad-0-5 bg-blue-100 text-blue-700">Onsite</span>
        )}
        {job.salaryRange && (
          <span className="text-xs px-pad-1-5 py-pad-0-5 bg-tint text-body">{job.salaryRange}</span>
        )}
      </div>
    </a>
  );
}
