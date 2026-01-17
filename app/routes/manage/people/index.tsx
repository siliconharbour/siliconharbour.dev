import type { Route } from "./+types/index";
import { Link, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllPeople, deletePerson, getPersonById } from "~/lib/people.server";
import { blockItem } from "~/lib/import-blocklist.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage People - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const people = await getAllPeople(true); // include hidden
  return { people };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  
  const formData = await request.formData();
  const intent = formData.get("intent");
  
  if (intent === "block-and-delete") {
    const personId = parseInt(formData.get("personId") as string, 10);
    
    const person = await getPersonById(personId);
    if (!person) {
      return { error: "Person not found" };
    }
    
    if (!person.github) {
      return { error: "Cannot block person without GitHub link" };
    }
    
    // Add to blocklist
    await blockItem("github", person.github, person.name, "Blocked from manage page");
    
    // Delete the person
    await deletePerson(personId);
    
    return { blocked: person.name };
  }
  
  return null;
}

export default function ManagePeopleIndex() {
  const { people } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const handleBlock = (personId: number, personName: string) => {
    if (confirm(`Block "${personName}" from future imports and delete? This will prevent this GitHub user from being imported again.`)) {
      fetcher.submit(
        { intent: "block-and-delete", personId: String(personId) },
        { method: "post" }
      );
    }
  };

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

        {fetcher.data?.blocked && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-700">
            Blocked "{fetcher.data.blocked}" from future imports
          </div>
        )}

        {fetcher.data?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">
            {fetcher.data.error}
          </div>
        )}

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
                    {person.github && (
                      <span className="text-xs px-1.5 py-0.5 bg-harbour-100 text-harbour-500">
                        GitHub
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
                  {person.github ? (
                    <button
                      type="button"
                      onClick={() => handleBlock(person.id, person.name)}
                      className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                      title="Block from import and delete"
                    >
                      Block
                    </button>
                  ) : (
                    <Link
                      to={`/manage/people/${person.id}/delete`}
                      className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </Link>
                  )}
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
