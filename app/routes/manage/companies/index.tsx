import { loadAdminOperation, runAdminOperation } from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";

import type { Route } from "./+types/index";
import { Link, useLoaderData, useSearchParams, Form } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { SearchInput } from "~/components/SearchInput";
import { Pagination } from "~/components/manage/Pagination";

const PER_PAGE = 50;

const MISSING_FILTERS = {
  logo: "No Logo",
  linkedin: "No LinkedIn",
  location: "No Location",
  founded: "No Founded",
  careers: "No Careers URL",
  "no-source": "No Job Source",
} as const;

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

  const missing = Object.hasOwn(MISSING_FILTERS, missingParam) ? missingParam : undefined;
  const [result, hidden, visible, filters] = await Promise.all([
    loadAdminOperation(request, operationCatalog.companyList, {
      limit: PER_PAGE,
      offset,
      query: searchQuery,
      sort: "name",
      order: "asc",
      ...(missing && { missing, visible: true }),
    }),
    loadAdminOperation(request, operationCatalog.companyList, { limit: 1, visible: false }),
    loadAdminOperation(request, operationCatalog.companyList, { limit: 1, visible: true }),
    Promise.all(
      Object.keys(MISSING_FILTERS).map(
        async (missing) =>
          [
            missing,
            (
              await loadAdminOperation(request, operationCatalog.companyList, {
                limit: 1,
                visible: true,
                missing,
              })
            ).total,
          ] as const,
      ),
    ),
  ]);
  return {
    companies: result.items,
    total: result.total,
    searchQuery,
    missingFilter: missing ?? "",
    hiddenCount: hidden.total,
    visibleCount: visible.total,
    currentPage: page,
    totalPages: Math.ceil(result.total / PER_PAGE),
    filterCounts: Object.fromEntries(filters),
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
