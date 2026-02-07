import type { Route } from "./+types/index";
import { Link, useLoaderData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getPaginatedCompanies,
  getHiddenCompaniesCount,
  getVisibleCompaniesCount,
  hideAllVisibleCompanies,
} from "~/lib/companies.server";
import { SearchInput } from "~/components/SearchInput";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Companies - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const [{ items: companies }, hiddenCount, visibleCount] = await Promise.all([
    getPaginatedCompanies(100, 0, searchQuery, true),
    getHiddenCompaniesCount(),
    getVisibleCompaniesCount(),
  ]);
  return { companies, searchQuery, hiddenCount, visibleCount };
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

export default function ManageCompaniesIndex() {
  const { companies, hiddenCount, visibleCount } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
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
                  <span className="px-1.5 py-0.5 bg-slate-600 text-xs ">
                    {visibleCount}
                  </span>
                </button>
              </Form>
            )}
            {hiddenCount > 0 && (
              <Link
                to="/manage/companies/review"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors flex items-center gap-2"
              >
                Review
                <span className="px-1.5 py-0.5 bg-amber-600 text-xs ">
                  {hiddenCount}
                </span>
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

        <SearchInput placeholder="Search companies..." />

        {companies.length === 0 ? (
          <div className="text-center p-12 text-harbour-400">
            No companies yet. Create your first company to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {companies.map((company) => (
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

        <div>
          <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
