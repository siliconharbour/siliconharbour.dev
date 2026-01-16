import type { Route } from "./+types/index";
import { useLoaderData } from "react-router";
import { getPaginatedLearning } from "~/lib/learning.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Learning - siliconharbour.dev" },
    { name: "description", content: "Educational institutions and resources in St. John's" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  const { items: institutions, total } = await getPaginatedLearning(limit, offset, searchQuery);
  
  return { institutions, total, limit, offset, searchQuery };
}

export default function LearningIndex() {
  const { institutions, total, limit, offset, searchQuery } = useLoaderData<typeof loader>();

  const typeLabels: Record<string, string> = {
    university: "University",
    college: "College",
    bootcamp: "Bootcamp",
    online: "Online",
    other: "Other",
  };

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">Learning</h1>
            <p className="text-harbour-500">Educational institutions and resources</p>
          </div>
          
          {/* Search */}
          <SearchInput placeholder="Search learning resources..." />
          
          {/* Result count */}
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>

        {institutions.length === 0 ? (
          <p className="text-harbour-400">
            {searchQuery ? "No learning resources match your search." : "No learning resources listed yet."}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {institutions.map((inst) => (
              <a
                key={inst.id}
                href={`/learning/${inst.slug}`}
                className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all no-underline"
              >
                {inst.logo && (
                  <div className="img-tint w-16 h-16 relative overflow-hidden bg-harbour-100">
                    <img
                      src={`/images/${inst.logo}`}
                      alt=""
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <h2 className="font-semibold text-harbour-700 group-hover:text-harbour-600">
                    {inst.name}
                  </h2>
                  <p className="text-sm text-harbour-400">{typeLabels[inst.type] ?? inst.type}</p>
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
