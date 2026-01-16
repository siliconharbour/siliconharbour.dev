import type { Route } from "./+types/index";
import { useLoaderData, Form } from "react-router";
import { getPaginatedPeople } from "~/lib/people.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "People - siliconharbour.dev" },
    { name: "description", content: "Community members in St. John's tech scene" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  const { items: people, total } = await getPaginatedPeople(limit, offset, searchQuery);
  
  return { people, total, limit, offset, searchQuery };
}

export default function PeopleIndex() {
  const { people, total, limit, offset, searchQuery } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">People</h1>
            <p className="text-harbour-500">Community members and contributors</p>
          </div>
          
          {/* Search */}
          <Form method="get" className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search people..."
              className="flex-1 px-3 py-2 text-sm border border-harbour-200 focus:border-harbour-400 focus:outline-none text-harbour-700"
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
            >
              Search
            </button>
            {searchQuery && (
              <a
                href="/people"
                className="px-4 py-2 text-sm text-harbour-600 border border-harbour-200 hover:border-harbour-300 no-underline"
              >
                Clear
              </a>
            )}
          </Form>
          
          {/* Result count */}
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>

        {people.length === 0 ? (
          <p className="text-harbour-400">
            {searchQuery ? "No people match your search." : "No people listed yet."}
          </p>
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
        
        <Pagination total={total} limit={limit} offset={offset} />
      </div>
    </div>
  );
}
