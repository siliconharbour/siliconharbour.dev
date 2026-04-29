import type { Route } from "./+types/index";
import { Link, useLoaderData, useSearchParams, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getHiddenCompaniesCount,
  getVisibleCompaniesCount,
  hideAllVisibleCompanies,
} from "~/lib/companies.server";
import { db } from "~/db";
import { companies } from "~/db/schema";
import { asc, and, or, eq, isNull, count as countFn } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { SearchInput } from "~/components/SearchInput";
import { Pagination } from "~/components/manage/Pagination";
import { searchContentIds } from "~/lib/search.server";
import { inArray } from "drizzle-orm";

const PER_PAGE = 50;

const MISSING_FILTERS = {
  logo: { label: "No Logo", condition: or(isNull(companies.logo), eq(companies.logo, "")) },
  linkedin: {
    label: "No LinkedIn",
    condition: or(isNull(companies.linkedin), eq(companies.linkedin, "")),
  },
  location: {
    label: "No Location",
    condition: or(isNull(companies.location), eq(companies.location, "")),
  },
  founded: { label: "No Founded", condition: isNull(companies.founded) },
  careers: {
    label: "No Careers URL",
    condition: or(isNull(companies.careersUrl), eq(companies.careersUrl, "")),
  },
} as const;

type MissingFilter = keyof typeof MISSING_FILTERS;

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Companies - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const missingParam = url.searchParams.get("missing") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const offset = (page - 1) * PER_PAGE;

  // Build WHERE conditions
  const conditions: SQL[] = [];

  // Search filter
  if (searchQuery.trim()) {
    const matchingIds = searchContentIds("company", searchQuery);
    if (matchingIds.length === 0) {
      const [hiddenCount, visibleCount] = await Promise.all([
        getHiddenCompaniesCount(),
        getVisibleCompaniesCount(),
      ]);
      return {
        companies: [],
        searchQuery,
        missingFilter: missingParam,
        hiddenCount,
        visibleCount,
        currentPage: 1,
        totalPages: 0,
        total: 0,
        filterCounts: {} as Record<string, number>,
      };
    }
    conditions.push(inArray(companies.id, matchingIds));
  }

  // Missing field filter
  const missingFilter = MISSING_FILTERS[missingParam as MissingFilter];
  if (missingFilter) {
    conditions.push(missingFilter.condition!);
    // Only show visible companies when filtering by missing fields
    conditions.push(eq(companies.visible, true));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count + fetch in parallel
  const [[{ total }], items] = await Promise.all([
    db.select({ total: countFn() }).from(companies).where(whereClause),
    db
      .select()
      .from(companies)
      .where(whereClause)
      .orderBy(asc(companies.name))
      .limit(PER_PAGE)
      .offset(offset),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  // Get counts for each missing filter (visible companies only)
  const filterCountResults = await Promise.all(
    Object.entries(MISSING_FILTERS).map(async ([key, { condition }]) => {
      const [{ cnt }] = await db
        .select({ cnt: countFn() })
        .from(companies)
        .where(and(eq(companies.visible, true), condition));
      return [key, cnt] as const;
    }),
  );
  const filterCounts = Object.fromEntries(filterCountResults) as Record<string, number>;

  const [hiddenCount, visibleCount] = await Promise.all([
    getHiddenCompaniesCount(),
    getVisibleCompaniesCount(),
  ]);

  return {
    companies: items,
    searchQuery,
    missingFilter: missingParam,
    hiddenCount,
    visibleCount,
    currentPage: page,
    totalPages,
    total,
    filterCounts,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "hide-all") {
    const count = await hideAllVisibleCompanies();
    return { success: true, hidden: count };
  }

  return { success: false };
}

function FilterButtons({
  filterCounts,
  activeFilter,
}: {
  filterCounts: Record<string, number>;
  activeFilter: string;
}) {
  const [searchParams] = useSearchParams();

  function buildFilterUrl(filter: string): string {
    const params = new URLSearchParams(searchParams);
    params.delete("page"); // reset page when changing filter
    if (filter === activeFilter) {
      params.delete("missing");
    } else {
      params.set("missing", filter);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  }

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(MISSING_FILTERS).map(([key, { label }]) => {
        const count = filterCounts[key] ?? 0;
        if (count === 0) return null;
        const isActive = activeFilter === key;
        return (
          <Link
            key={key}
            to={buildFilterUrl(key)}
            className={`px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              isActive
                ? "bg-harbour-600 text-white border-harbour-600"
                : "bg-white text-harbour-600 border-harbour-200 hover:border-harbour-300"
            }`}
          >
            {label}
            <span
              className={`px-1 py-0.5 text-xs ${
                isActive ? "bg-harbour-700" : "bg-harbour-100 text-harbour-500"
              }`}
            >
              {count}
            </span>
          </Link>
        );
      })}
      {activeFilter && (
        <Link
          to={buildFilterUrl(activeFilter)}
          className="px-3 py-1.5 text-xs font-medium text-harbour-400 hover:text-harbour-600"
        >
          Clear filter
        </Link>
      )}
    </div>
  );
}

export default function ManageCompaniesIndex() {
  const {
    companies: companyList,
    hiddenCount,
    visibleCount,
    currentPage,
    totalPages,
    total,
    missingFilter,
    filterCounts,
  } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-harbour-700">Companies</h1>
          <div className="flex items-center gap-3">
            {visibleCount > 0 && (
              <Form
                method="post"
                onSubmit={(e) => {
                  if (
                    !confirm(
                      `Hide all ${visibleCount} visible companies? This will let you re-review them.`,
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="hide-all" />
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white font-medium transition-colors flex items-center gap-2"
                >
                  Hide All
                  <span className="px-1.5 py-0.5 bg-slate-600 text-xs ">{visibleCount}</span>
                </button>
              </Form>
            )}
            {hiddenCount > 0 && (
              <Link
                to="/manage/companies/review"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors flex items-center gap-2"
              >
                Review
                <span className="px-1.5 py-0.5 bg-amber-600 text-xs ">{hiddenCount}</span>
              </Link>
            )}
            <Link
              to="/manage/companies/new"
              className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
            >
              New Company
            </Link>
          </div>
        </div>

        <SearchInput placeholder="Search companies..." preserveParams={["missing"]} />
        <FilterButtons filterCounts={filterCounts} activeFilter={missingFilter} />

        {companyList.length === 0 ? (
          <div className="text-center p-12 text-harbour-400">
            {missingFilter
              ? "No companies match this filter."
              : "No companies yet. Create your first company to get started."}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {companyList.map((company) => (
              <div
                key={company.id}
                className={`flex items-center gap-4 p-4 border ${
                  company.visible ? "bg-white border-harbour-200" : "bg-amber-50 border-amber-200"
                }`}
              >
                {company.logo ? (
                  <img
                    src={`/images/${company.logo}`}
                    alt=""
                    className="w-12 h-12 object-contain"
                  />
                ) : (
                  <div className="w-12 h-12 bg-harbour-100 flex items-center justify-center">
                    <span className="text-lg text-harbour-400">{company.name.charAt(0)}</span>
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium truncate text-harbour-700">{company.name}</h2>
                    {!company.visible && (
                      <span className="text-xs px-1.5 py-0.5 bg-amber-200 text-amber-700">
                        Hidden
                      </span>
                    )}
                  </div>
                  {company.location && (
                    <p className="text-sm text-harbour-400">{company.location}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/manage/companies/${company.id}`}
                    className="px-3 py-1.5 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/manage/companies/${company.id}/delete`}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <Pagination currentPage={currentPage} totalPages={totalPages} total={total} />

        <div>
          <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
