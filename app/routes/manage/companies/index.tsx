import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Route } from "./+types/index";
import { Link, useLoaderData, useSearchParams, Form } from "react-router";
import { requireAdmin } from "~/lib/session.server";
import { getHiddenCompaniesCount, getVisibleCompaniesCount } from "~/lib/companies.server";
import { db } from "~/db";
import { companies, jobImportSources } from "~/db/schema";
import { asc, and, or, eq, isNull, notInArray, count as countFn } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { SearchInput } from "~/components/SearchInput";
import { Pagination } from "~/components/manage/Pagination";
import { searchContentIds, searchRankOrder } from "~/lib/search.server";
import { inArray } from "drizzle-orm";

const PER_PAGE = 50;

const MISSING_FILTERS = {
  logo: "No Logo",
  linkedin: "No LinkedIn",
  location: "No Location",
  founded: "No Founded",
  careers: "No Careers URL",
  "no-source": "No Job Source",
} as const;

/**
 * Build the WHERE condition for a missing-field filter.
 * Called inside the loader so DB references stay server-side.
 */
function getFilterCondition(key: string): SQL | undefined {
  const empty = (col: AnySQLiteColumn) => or(isNull(col), eq(col, ""));
  switch (key) {
    case "logo":
      return empty(companies.logo);
    case "linkedin":
      return empty(companies.linkedin);
    case "location":
      return empty(companies.location);
    case "founded":
      return isNull(companies.founded);
    case "careers":
      return empty(companies.careersUrl);
    case "no-source":
      return notInArray(
        companies.id,
        db.selectDistinct({ id: jobImportSources.companyId }).from(jobImportSources),
      );
    default:
      return undefined;
  }
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Companies - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const missingParam = url.searchParams.get("missing") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const offset = (page - 1) * PER_PAGE;

  // Build WHERE conditions
  const conditions: SQL[] = [];
  let rankedSearchIds: number[] | null = null;

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
    rankedSearchIds = matchingIds;
    conditions.push(inArray(companies.id, matchingIds));
  }

  // Missing field filter
  const filterCondition = getFilterCondition(missingParam);
  if (filterCondition) {
    conditions.push(filterCondition);
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
      .orderBy(
        rankedSearchIds ? searchRankOrder(companies.id, rankedSearchIds) : asc(companies.name),
      )
      .limit(PER_PAGE)
      .offset(offset),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  // Get counts for each missing filter (visible companies only)
  const filterCountResults = await Promise.all(
    Object.keys(MISSING_FILTERS).map(async (key) => {
      const cond = getFilterCondition(key);
      if (!cond) return [key, 0] as const;
      const [{ cnt }] = await db
        .select({ cnt: countFn() })
        .from(companies)
        .where(and(eq(companies.visible, true), cond));
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
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get("intent") !== "hide-all") return { success: false };
  const result = await runAdminOperation(request, operationCatalog.companyHideAllVisible, {
    confirm: true,
  });
  return result.ok
    ? { success: true, hidden: result.data.hidden }
    : { success: false, error: result.error };
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
    <div className="flex flex-wrap gap-gap-2">
      {Object.entries(MISSING_FILTERS).map(([key, label]) => {
        const count = filterCounts[key] ?? 0;
        if (count === 0) return null;
        const isActive = activeFilter === key;
        return (
          <Link
            key={key}
            to={buildFilterUrl(key)}
            className={`px-pad-3 py-pad-1-5 text-xs font-medium border transition-colors flex items-center gap-gap-1-5 ${
              isActive
                ? "bg-primary text-white border-harbour-600"
                : "bg-surface text-body border-line hover:border-harbour-300"
            }`}
          >
            {label}
            <span
              className={`px-pad-1 py-pad-0-5 text-xs ${
                isActive ? "bg-primary-hover" : "bg-tint text-muted"
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
          className="px-pad-3 py-pad-1-5 text-xs font-medium text-subtle hover:text-body"
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
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-gap-6">
        <div className="flex flex-wrap items-center justify-between gap-gap-2">
          <h1 className="text-2xl font-semibold text-heading">Companies</h1>
          <div className="flex items-center gap-gap-3">
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
                  className="px-pad-4 py-pad-2 bg-slate-500 hover:bg-slate-600 text-white font-medium transition-colors flex items-center gap-gap-2"
                >
                  Hide All
                  <span className="px-pad-1-5 py-pad-0-5 bg-slate-600 text-xs ">
                    {visibleCount}
                  </span>
                </button>
              </Form>
            )}
            {hiddenCount > 0 && (
              <Link
                to="/manage/companies/review"
                className="px-pad-4 py-pad-2 bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors flex items-center gap-gap-2"
              >
                Review
                <span className="px-pad-1-5 py-pad-0-5 bg-amber-600 text-xs ">{hiddenCount}</span>
              </Link>
            )}
            <Link
              to="/manage/companies/new"
              className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
            >
              New Company
            </Link>
          </div>
        </div>

        <SearchInput placeholder="Search companies..." preserveParams={["missing"]} />
        <FilterButtons filterCounts={filterCounts} activeFilter={missingFilter} />

        {companyList.length === 0 ? (
          <div className="text-center p-pad-12 text-subtle">
            {missingFilter
              ? "No companies match this filter."
              : "No companies yet. Create your first company to get started."}
          </div>
        ) : (
          <div className="flex flex-col gap-gap-4">
            {companyList.map((company) => (
              <div
                key={company.id}
                className={`flex items-center gap-gap-4 p-pad-4 border ${
                  company.visible ? "bg-surface border-line" : "bg-amber-50 border-amber-200"
                }`}
              >
                {company.logo ? (
                  <img
                    src={`/images/${company.logo}`}
                    alt=""
                    className="w-12 h-12 object-contain"
                  />
                ) : (
                  <div className="w-12 h-12 bg-tint flex items-center justify-center">
                    <span className="text-lg text-subtle">{company.name.charAt(0)}</span>
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-gap-0-5">
                  <div className="flex items-center gap-gap-2">
                    <h2 className="font-medium truncate text-heading">{company.name}</h2>
                    {!company.visible && (
                      <span className="text-xs px-pad-1-5 py-pad-0-5 bg-amber-200 text-amber-700">
                        Hidden
                      </span>
                    )}
                  </div>
                  {company.location && <p className="text-sm text-subtle">{company.location}</p>}
                </div>

                <div className="flex items-center gap-gap-2">
                  <Link
                    to={`/manage/companies/${company.id}`}
                    className="px-pad-3 py-pad-1-5 text-sm font-medium text-body hover:bg-soft transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/manage/companies/${company.id}/delete`}
                    className="px-pad-3 py-pad-1-5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
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
          <Link to="/manage" className="text-sm text-subtle hover:text-body">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
