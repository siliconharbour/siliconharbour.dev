import type { Route } from "./+types/index";
import { useLoaderData, useSearchParams, Link } from "react-router";
import { getPaginatedCompanies } from "~/lib/companies.server";
import { getPaginatedGroups } from "~/lib/groups.server";
import { getPaginatedLearning } from "~/lib/learning.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";

const tabs = [
  { key: "companies", label: "Companies" },
  { key: "groups", label: "Groups" },
  { key: "learning", label: "Learning" },
] as const;

type TabKey = typeof tabs[number]["key"];

export function meta({ data }: Route.MetaArgs) {
  const tab = data?.tab || "companies";
  const labels: Record<TabKey, string> = {
    companies: "Companies",
    groups: "Groups",
    learning: "Learning",
  };
  return [
    { title: `${labels[tab as TabKey]} - siliconharbour.dev` },
    { name: "description", content: "Directory of companies, groups, and learning resources in St. John's tech community" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const tab = (url.searchParams.get("tab") as TabKey) || "companies";
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  // Fetch data based on active tab
  if (tab === "companies") {
    const { items, total } = await getPaginatedCompanies(limit, offset, searchQuery);
    return { tab, items, total, limit, offset, searchQuery };
  } else if (tab === "groups") {
    const { items, total } = await getPaginatedGroups(limit, offset, searchQuery);
    return { tab, items, total, limit, offset, searchQuery };
  } else {
    const { items, total } = await getPaginatedLearning(limit, offset, searchQuery);
    return { tab, items, total, limit, offset, searchQuery };
  }
}

const learningTypeLabels: Record<string, string> = {
  university: "University",
  college: "College",
  bootcamp: "Bootcamp",
  online: "Online",
  other: "Other",
};

export default function DirectoryIndex() {
  const { tab, items, total, limit, offset, searchQuery } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  // Helper to build tab URL while preserving pagination params
  const getTabUrl = (tabKey: TabKey) => {
    const params = new URLSearchParams();
    params.set("tab", tabKey);
    // Reset pagination when switching tabs
    return `/directory?${params.toString()}`;
  };

  // Helper to preserve tab in pagination
  const getPaginationUrl = (newOffset: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("offset", String(newOffset));
    return `?${params.toString()}`;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">Directory</h1>
            <p className="text-harbour-500">Companies, groups, and learning resources in the tech community</p>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-1 border-b border-harbour-200">
            {tabs.map((t) => (
              <Link
                key={t.key}
                to={getTabUrl(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? "border-harbour-600 text-harbour-700"
                    : "border-transparent text-harbour-400 hover:text-harbour-600"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
          
          {/* Search */}
          {(total > limit || searchQuery) && (
            <>
              <SearchInput placeholder={`Search ${tab}...`} />
              {searchQuery && (
                <p className="text-sm text-harbour-500">
                  {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
                </p>
              )}
            </>
          )}
        </div>

        {/* Content based on tab */}
        {items.length === 0 ? (
          <p className="text-harbour-400">
            {searchQuery ? `No ${tab} match your search.` : `No ${tab} listed yet.`}
          </p>
        ) : tab === "companies" ? (
          <CompaniesGrid items={items as any} />
        ) : tab === "groups" ? (
          <GroupsGrid items={items as any} />
        ) : (
          <LearningGrid items={items as any} />
        )}
        
        <Pagination total={total} limit={limit} offset={offset} />
      </div>
    </div>
  );
}

function CompaniesGrid({ items }: { items: Array<{ id: number; slug: string; name: string; logo: string | null; location: string | null }> }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((company) => (
        <a
          key={company.id}
          href={`/companies/${company.slug}`}
          className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
        >
          {company.logo ? (
            <div className="w-16 h-16 relative overflow-hidden bg-harbour-100">
              <img
                src={`/images/${company.logo}`}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center">
              <span className="text-2xl text-harbour-400">{company.name.charAt(0)}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
              {company.name}
            </h2>
            {company.location && (
              <p className="text-sm text-harbour-400">{company.location}</p>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}

function GroupsGrid({ items }: { items: Array<{ id: number; slug: string; name: string; logo: string | null; meetingFrequency: string | null }> }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((group) => (
        <a
          key={group.id}
          href={`/groups/${group.slug}`}
          className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
        >
          {group.logo ? (
            <div className="w-16 h-16 relative overflow-hidden bg-harbour-100">
              <img
                src={`/images/${group.logo}`}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center">
              <span className="text-2xl text-harbour-400">{group.name.charAt(0)}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
              {group.name}
            </h2>
            {group.meetingFrequency && (
              <p className="text-sm text-harbour-400">{group.meetingFrequency}</p>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}

function LearningGrid({ items }: { items: Array<{ id: number; slug: string; name: string; logo: string | null; type: string }> }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item) => (
        <a
          key={item.id}
          href={`/learning/${item.slug}`}
          className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
        >
          {item.logo ? (
            <div className="w-16 h-16 relative overflow-hidden bg-harbour-100">
              <img
                src={`/images/${item.logo}`}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center">
              <span className="text-2xl text-harbour-400">{item.name.charAt(0)}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
              {item.name}
            </h2>
            <p className="text-sm text-harbour-400">{learningTypeLabels[item.type]}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
