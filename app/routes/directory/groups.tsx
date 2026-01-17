import type { Route } from "./+types/groups";
import { useLoaderData } from "react-router";
import { getPaginatedGroups } from "~/lib/groups.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Groups - Directory - siliconharbour.dev" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  const { items, total } = await getPaginatedGroups(limit, offset, searchQuery);
  return { items, total, limit, offset, searchQuery };
}

export default function DirectoryGroups() {
  const { items, total, limit, offset, searchQuery } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-6">
      {/* Search */}
      {(total > limit || searchQuery) && (
        <div className="flex flex-col gap-2">
          <SearchInput placeholder="Search groups..." />
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-harbour-400">
          {searchQuery ? "No groups match your search." : "No groups listed yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((group) => (
            <a
              key={group.id}
              href={`/directory/groups/${group.slug}`}
              className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 focus:ring-harbour-400 transition-all"
            >
              {group.logo ? (
                <div className="w-16 h-16 relative overflow-hidden bg-harbour-100">
                  <img
                    src={`/images/${group.logo}`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center">
                  <span className="text-2xl text-harbour-400">{group.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
                  {group.name}
                </h2>
                {group.meetingFrequency && (
                  <p className="text-sm text-harbour-400">{group.meetingFrequency}</p>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
      
      <Pagination total={total} limit={limit} offset={offset} />
    </div>
  );
}
