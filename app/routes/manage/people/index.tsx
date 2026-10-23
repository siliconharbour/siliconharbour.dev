import { loadAdminOperation, runAdminOperation } from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";

import type { Route } from "./+types/index";
import { Link, useLoaderData, Form } from "react-router";
import { requireAdmin } from "~/lib/session.server";

import { SearchInput } from "~/components/SearchInput";
import { Pagination } from "~/components/manage/Pagination";

const PER_PAGE = 50;

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage People - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const offset = (page - 1) * PER_PAGE;
  const [{ items: people, total }, hiddenCount, visibleCount] = await Promise.all([
    loadAdminOperation(request, operationCatalog.personList, {
      limit: PER_PAGE,
      offset,
      query: searchQuery,
      sort: "createdAt",
      order: "desc",
    }),
    loadAdminOperation(request, operationCatalog.personList, { limit: 1, visible: false }).then(
      (page) => page.total,
    ),
    loadAdminOperation(request, operationCatalog.personList, { limit: 1, visible: true }).then(
      (page) => page.total,
    ),
  ]);
  const totalPages = Math.ceil(total / PER_PAGE);
  return { people, searchQuery, hiddenCount, visibleCount, currentPage: page, totalPages, total };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get("intent") !== "hide-all") return { success: false };
  const result = await runAdminOperation(request, operationCatalog.personHideAllVisible, {
    confirm: true,
  });
  return result.ok
    ? { success: true, hidden: result.data.hidden }
    : { success: false, error: result.error };
}

export default function ManagePeopleIndex() {
  const { people, hiddenCount, visibleCount, currentPage, totalPages, total } =
    useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-gap-6">
        <div className="flex flex-wrap items-center justify-between gap-gap-2">
          <h1 className="text-2xl font-semibold text-heading">People</h1>
          <div className="flex items-center gap-gap-3">
            {visibleCount > 0 && (
              <Form
                method="post"
                onSubmit={(e) => {
                  if (
                    !confirm(
                      `Hide all ${visibleCount} visible people? This will let you re-review them.`,
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
                to="/manage/people/review"
                className="px-pad-4 py-pad-2 bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors flex items-center gap-gap-2"
              >
                Review
                <span className="px-pad-1-5 py-pad-0-5 bg-amber-600 text-xs ">{hiddenCount}</span>
              </Link>
            )}
            <Link
              to="/manage/people/new"
              className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
            >
              New Person
            </Link>
          </div>
        </div>

        <SearchInput placeholder="Search people..." />

        {people.length === 0 ? (
          <div className="text-center p-pad-12 text-subtle">
            No people yet. Create your first person to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-gap-4">
            {people.map((person) => (
              <div
                key={person.id}
                className={`flex items-center gap-gap-4 p-pad-4 border ${
                  person.visible ? "bg-surface border-line" : "bg-amber-50 border-amber-200"
                }`}
              >
                {person.avatar ? (
                  <img src={`/images/${person.avatar}`} alt="" className="w-12 h-12 object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-tint flex items-center justify-center">
                    <span className="text-lg text-subtle">{person.name.charAt(0)}</span>
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-gap-0-5">
                  <div className="flex items-center gap-gap-2">
                    <h2 className="font-medium truncate text-heading">{person.name}</h2>
                    {!person.visible && (
                      <span className="text-xs px-pad-1-5 py-pad-0-5 bg-amber-200 text-amber-700">
                        Hidden
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-gap-2">
                  <Link
                    to={`/manage/people/${person.id}`}
                    className="px-pad-3 py-pad-1-5 text-sm font-medium text-body hover:bg-soft transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/manage/people/${person.id}/delete`}
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
