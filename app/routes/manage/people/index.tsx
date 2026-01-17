import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllPeople } from "~/lib/people.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage People - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const people = await getAllPeople(true); // include hidden
  return { people };
}

export default function ManagePeopleIndex() {
  const { people } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-harbour-700">People</h1>
          <Link
            to="/manage/people/new"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            New Person
          </Link>
        </div>

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
                  person.visible 
                    ? "bg-white border-harbour-200" 
                    : "bg-amber-50 border-amber-200"
                }`}
              >
                {person.avatar ? (
                  <img
                    src={`/images/${person.avatar}`}
                    alt=""
                    className="w-12 h-12 object-cover"
                  />
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
          <Link
            to="/manage"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
