import type { Route } from "./+types/index";
import { useLoaderData } from "react-router";
import { getPaginatedPeople } from "~/lib/people.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";

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
          
          {/* Search - only show if pagination is needed */}
          {(total > limit || searchQuery) && (
            <>
              <SearchInput placeholder="Search people..." />
              
              {/* Result count */}
              {searchQuery && (
                <p className="text-sm text-harbour-500">
                  {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
                </p>
              )}
            </>
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
                className="group flex items-center gap-4 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
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
                  <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
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
