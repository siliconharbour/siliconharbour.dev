import type { Route } from "./+types/index";
import { useLoaderData, Form } from "react-router";
import { getPaginatedGroups } from "~/lib/groups.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Groups - siliconharbour.dev" },
    { name: "description", content: "Tech groups and meetups in St. John's" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  const { items: groups, total } = await getPaginatedGroups(limit, offset, searchQuery);
  
  return { groups, total, limit, offset, searchQuery };
}

export default function GroupsIndex() {
  const { groups, total, limit, offset, searchQuery } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">Groups</h1>
            <p className="text-harbour-500">Meetups and community organizations</p>
          </div>
          
          {/* Search */}
          <Form method="get" className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search groups..."
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
                href="/groups"
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

        {groups.length === 0 ? (
          <p className="text-harbour-400">
            {searchQuery ? "No groups match your search." : "No groups listed yet."}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <a
                key={group.id}
                href={`/groups/${group.slug}`}
                className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all no-underline"
              >
                {group.logo && (
                  <div className="img-tint w-16 h-16 relative overflow-hidden bg-harbour-100">
                    <img
                      src={`/images/${group.logo}`}
                      alt=""
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <h2 className="font-semibold text-harbour-700 group-hover:text-harbour-600">
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
    </div>
  );
}
