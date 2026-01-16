import type { Route } from "./+types/index";
import { useLoaderData } from "react-router";
import { getAllPeople } from "~/lib/people.server";
import { PublicLayout } from "~/components/PublicLayout";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "People - siliconharbour.dev" },
    { name: "description", content: "Community members in St. John's tech scene" },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const people = await getAllPeople();
  return { people };
}

export default function PeopleIndex() {
  const { people } = useLoaderData<typeof loader>();

  return (
    <PublicLayout>
      <div className="max-w-6xl mx-auto p-4 py-8">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">People</h1>
            <p className="text-harbour-500">Community members and contributors</p>
          </div>

          {people.length === 0 ? (
            <p className="text-harbour-400">No people listed yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {people.map((person) => (
                <a
                  key={person.id}
                  href={`/people/${person.slug}`}
                  className="group flex items-center gap-4 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all no-underline"
                >
                  {person.avatar ? (
                    <div className="img-tint w-16 h-16 relative overflow-hidden bg-harbour-100 flex-shrink-0">
                      <img
                        src={`/images/${person.avatar}`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl text-harbour-400">{person.name.charAt(0)}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <h2 className="font-semibold text-harbour-700 group-hover:text-harbour-600">
                      {person.name}
                    </h2>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
