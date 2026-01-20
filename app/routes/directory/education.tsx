import type { Route } from "./+types/education";
import { Link, useLoaderData } from "react-router";
import { getPaginatedEducation } from "~/lib/education.server";
import { getOptionalUser } from "~/lib/session.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Education - Directory - siliconharbour.dev" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  
  const { items, total } = await getPaginatedEducation(limit, offset, searchQuery);
  return { items, total, limit, offset, searchQuery, isAdmin };
}

const typeLabels: Record<string, string> = {
  university: "University",
  college: "College",
  bootcamp: "Bootcamp",
  online: "Online",
  other: "Other",
};

export default function DirectoryEducation() {
  const { items, total, limit, offset, searchQuery, isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-6">
      {isAdmin && (
        <div className="flex justify-end">
          <Link
            to="/manage/education/new"
            className="px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
          >
            + New Education Resource
          </Link>
        </div>
      )}

      {/* Search */}
      {(total > limit || searchQuery) && (
        <div className="flex flex-col gap-2">
          <SearchInput placeholder="Search education resources..." />
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-harbour-400">
          {searchQuery ? "No education resources match your search." : "No education resources listed yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <a
              key={item.id}
              href={`/directory/education/${item.slug}`}
              className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 focus:ring-harbour-400 transition-all"
            >
              {item.logo ? (
                <div className="w-16 h-16 relative overflow-hidden bg-harbour-100">
                  <img
                    src={`/images/${item.logo}`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center">
                  <span className="text-2xl text-harbour-400">{item.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
                  {item.name}
                </h2>
                <p className="text-sm text-harbour-400">{typeLabels[item.type] ?? item.type}</p>
              </div>
            </a>
          ))}
        </div>
      )}
      
      <Pagination total={total} limit={limit} offset={offset} />
    </div>
  );
}
