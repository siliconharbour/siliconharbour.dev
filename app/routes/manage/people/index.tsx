import type { Route } from "./+types/index";
import { Link, useLoaderData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getPaginatedPeople,
  getHiddenPeopleCount,
  getVisiblePeopleCount,
  hideAllVisiblePeople,
} from "~/lib/people.server";
import { SearchInput } from "~/components/SearchInput";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage People - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const [{ items: people }, hiddenCount, visibleCount] = await Promise.all([
    getPaginatedPeople(100, 0, searchQuery, true),
    getHiddenPeopleCount(),
    getVisiblePeopleCount(),
  ]);
  return { people, searchQuery, hiddenCount, visibleCount };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "hide-all") {
    const count = await hideAllVisiblePeople();
    return { success: true, hidden: count };
  }

  return { success: false };
}

export default function ManagePeopleIndex() {
  const { people, hiddenCount, visibleCount } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">People</h1>
          <div className="flex items-center gap-3">
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
                to="/manage/people/review"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors flex items-center gap-2"
              >
                Review
                <span className="px-1.5 py-0.5 bg-amber-600 text-xs ">
                  {hiddenCount}
                </span>
              </Link>
            )}
            <Link
              to="/manage/people/new"
              className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
            >
              New Person
            </Link>
          </div>
        </div>

        <SearchInput placeholder="Search people..." />

        {people.length === 0 ? (
          <div className="text-center p-12 text-harbour-400">
            No people yet. Create your first person to get started.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {people.map((person) => (
              <div
                key={person.id}
                className={`flex items-center gap-4 p-4 border ${
                  person.visible ? "bg-white border-harbour-200" : "bg-amber-50 border-amber-200"
                }`}
              >
                {person.avatar ? (
                  <img src={`/images/${person.avatar}`} alt="" className="w-12 h-12 object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-harbour-100 flex items-center justify-center">
                    <span className="text-lg text-harbour-400">{person.name.charAt(0)}</span>
                  </div>
                )}

                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium truncate text-harbour-700">{person.name}</h2>
                    {!person.visible && (
                      <span className="text-xs px-1.5 py-0.5 bg-amber-200 text-amber-700">
                        Hidden
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/manage/people/${person.id}`}
                    className="px-3 py-1.5 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/manage/people/${person.id}/delete`}
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
