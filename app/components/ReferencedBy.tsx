import { Link } from "react-router";
import { format } from "date-fns";
import type { DetailedBacklink } from "~/lib/references.server";

import { EventCard } from "./EventCard";

interface ReferencedByProps {
  backlinks: DetailedBacklink[];
}

export function ReferencedBy({ backlinks }: ReferencedByProps) {
  if (backlinks.length === 0) return null;

  // Group backlinks by type
  const grouped = backlinks.reduce(
    (acc, link) => {
      if (!acc[link.type]) acc[link.type] = [];
      acc[link.type].push(link);
      return acc;
    },
    {} as Record<string, DetailedBacklink[]>,
  );

  const typeOrder = [
    "event",
    "news",
    "job",
    "company",
    "project",
    "group",
    "person",
    "education",
  ] as const;
  const sortedTypes = typeOrder.filter((t) => grouped[t]?.length > 0);

  return (
    <div className="border-t border-harbour-200/50 pt-6">
      <div className="flex flex-col gap-6">
        {sortedTypes.map((type) => (
          <BacklinkSection key={type} type={type} backlinks={grouped[type]} />
        ))}
      </div>
    </div>
  );
}

function BacklinkSection({ type, backlinks }: { type: string; backlinks: DetailedBacklink[] }) {
  const labels: Record<string, string> = {
    event: "Events",
    news: "News",
    job: "Jobs",
    company: "Companies",
    project: "Projects",
    group: "Groups",
    person: "People",
    education: "Education",
  };

  // Events use single column with max-width, others use 2-column grid
  const gridClass =
    type === "event" ? "flex flex-col gap-4 max-w-md" : "grid grid-cols-1 sm:grid-cols-2 gap-3";

  return (
    <div>
      <h3 className="text-sm font-medium text-harbour-500 mb-3">{labels[type] || type}</h3>
      <div className={gridClass}>
        {backlinks.map((link) => (
          <BacklinkCard key={`${link.type}-${link.data.id}`} backlink={link} />
        ))}
      </div>
    </div>
  );
}

function BacklinkCard({ backlink }: { backlink: DetailedBacklink }) {
  switch (backlink.type) {
    case "event":
      return <EventCard event={backlink.data} />;
    case "news":
      return <NewsCard data={backlink.data} />;
    case "job":
      return <JobCard data={backlink.data} />;
    case "company":
      return <CompanyCard data={backlink.data} />;
    case "project":
      return <ProjectCard data={backlink.data} />;
    case "group":
      return <GroupCard data={backlink.data} />;
    case "person":
      return <PersonCard data={backlink.data} relation={backlink.relation} />;
    case "education":
      return <EducationCard data={backlink.data} />;
    default:
      return null;
  }
}

function NewsCard({
  data,
}: {
  data: DetailedBacklink & { type: "news" } extends { data: infer D } ? D : never;
}) {
  return (
    <Link
      to={`/news/${data.slug}`}
      className="group flex gap-3 p-3 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
    >
      {data.coverImage ? (
        <div className="img-tint w-16 h-16 relative overflow-hidden bg-harbour-100 flex-shrink-0">
          <img
            src={`/images/${data.coverImage}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-6 h-6 text-harbour-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
            />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h4 className="link-title font-medium text-harbour-700 group-hover:text-harbour-600 line-clamp-2">
          {data.title}
        </h4>
        {data.publishedAt && (
          <p className="text-sm text-harbour-500 mt-1">{format(data.publishedAt, "MMM d, yyyy")}</p>
        )}
      </div>
    </Link>
  );
}

function JobCard({
  data,
}: {
  data: DetailedBacklink & { type: "job" } extends { data: infer D } ? D : never;
}) {
  return (
    <Link
      to={`/jobs/${data.slug}`}
      className="group flex flex-col p-3 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
    >
      <h4 className="link-title font-medium text-harbour-700 group-hover:text-harbour-600 line-clamp-2">
        {data.title}
      </h4>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-harbour-500 mt-1">
        {data.location && <span>{data.location}</span>}
        {data.workplaceType === "remote" && (
          <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700">Remote</span>
        )}
      </div>
    </Link>
  );
}

function CompanyCard({
  data,
}: {
  data: DetailedBacklink & { type: "company" } extends { data: infer D } ? D : never;
}) {
  return (
    <Link
      to={`/directory/companies/${data.slug}`}
      className="group flex items-center gap-3 p-3 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
    >
      {data.logo ? (
        <div className="img-tint w-10 h-10 relative overflow-hidden bg-harbour-100 flex-shrink-0">
          <img
            src={`/images/${data.logo}`}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="w-10 h-10 bg-harbour-100 flex items-center justify-center flex-shrink-0">
          <span className="text-lg text-harbour-400">{data.name.charAt(0)}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h4 className="link-title font-medium text-harbour-700 group-hover:text-harbour-600 line-clamp-1">
          {data.name}
        </h4>
        {data.location && <p className="text-sm text-harbour-500">{data.location}</p>}
      </div>
    </Link>
  );
}

function ProjectCard({
  data,
}: {
  data: DetailedBacklink & { type: "project" } extends { data: infer D } ? D : never;
}) {
  return (
    <Link
      to={`/directory/projects/${data.slug}`}
      className="group flex items-center gap-3 p-3 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
    >
      {data.logo ? (
        <div className="img-tint w-10 h-10 relative overflow-hidden bg-harbour-100 flex-shrink-0">
          <img
            src={`/images/${data.logo}`}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="w-10 h-10 bg-harbour-100 flex items-center justify-center flex-shrink-0">
          <span className="text-lg text-harbour-400">{data.name.charAt(0)}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h4 className="link-title font-medium text-harbour-700 group-hover:text-harbour-600 line-clamp-1">
          {data.name}
        </h4>
        <p className="text-sm text-harbour-500 capitalize">{data.type}</p>
      </div>
    </Link>
  );
}

function GroupCard({
  data,
}: {
  data: DetailedBacklink & { type: "group" } extends { data: infer D } ? D : never;
}) {
  return (
    <Link
      to={`/directory/groups/${data.slug}`}
      className="group flex items-center gap-3 p-3 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
    >
      {data.logo ? (
        <div className="img-tint w-10 h-10 relative overflow-hidden bg-harbour-100 flex-shrink-0">
          <img
            src={`/images/${data.logo}`}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="w-10 h-10 bg-harbour-100 flex items-center justify-center flex-shrink-0">
          <span className="text-lg text-harbour-400">{data.name.charAt(0)}</span>
        </div>
      )}
      <h4 className="link-title font-medium text-harbour-700 group-hover:text-harbour-600 line-clamp-1 flex-1 min-w-0">
        {data.name}
      </h4>
    </Link>
  );
}

function PersonCard({
  data,
  relation,
}: {
  data: DetailedBacklink & { type: "person" } extends { data: infer D } ? D : never;
  relation?: string;
}) {
  return (
    <Link
      to={`/directory/people/${data.slug}`}
      className="group flex items-center gap-3 p-3 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
    >
      {data.avatar ? (
        <div className="img-tint w-10 h-10 relative overflow-hidden bg-harbour-100 rounded-full flex-shrink-0">
          <img
            src={`/images/${data.avatar}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-10 h-10 bg-harbour-100 rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-lg text-harbour-400">{data.name.charAt(0)}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h4 className="link-title font-medium text-harbour-700 group-hover:text-harbour-600 line-clamp-1">
          {data.name}
        </h4>
        {relation && <p className="text-sm text-harbour-500">{relation}</p>}
      </div>
    </Link>
  );
}

function EducationCard({
  data,
}: {
  data: DetailedBacklink & { type: "education" } extends { data: infer D } ? D : never;
}) {
  return (
    <Link
      to={`/directory/education/${data.slug}`}
      className="group flex items-center gap-3 p-3 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
    >
      {data.logo ? (
        <div className="img-tint w-10 h-10 relative overflow-hidden bg-harbour-100 flex-shrink-0">
          <img
            src={`/images/${data.logo}`}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
      ) : (
        <div className="w-10 h-10 bg-harbour-100 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-harbour-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h4 className="link-title font-medium text-harbour-700 group-hover:text-harbour-600 line-clamp-1">
          {data.name}
        </h4>
        {data.type && <p className="text-sm text-harbour-500 capitalize">{data.type}</p>}
      </div>
    </Link>
  );
}
