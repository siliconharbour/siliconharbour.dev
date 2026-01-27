import type { Route } from "./+types/companies";
import { Link, useLoaderData } from "react-router";
import { getPaginatedCompanies } from "~/lib/companies.server";
import { getOptionalUser } from "~/lib/session.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Companies - Directory - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";

  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";

  const { items, total } = await getPaginatedCompanies(limit, offset, searchQuery);
  return { items, total, limit, offset, searchQuery, isAdmin };
}

export default function DirectoryCompanies() {
  const { items, total, limit, offset, searchQuery, isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-6">
      {/* Admin create button */}
      {isAdmin && (
        <div className="flex justify-end">
          <Link
            to="/manage/companies/new"
            className="px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
          >
            + New Company
          </Link>
        </div>
      )}

      {/* Search */}
      {(total > limit || searchQuery) && (
        <div className="flex flex-col gap-2">
          <SearchInput placeholder="Search companies..." />
          {searchQuery && (
            <p className="text-sm text-harbour-500">
              {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-harbour-400">
          {searchQuery ? "No companies match your search." : "No companies listed yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((company) => (
            <a
              key={company.id}
              href={`/directory/companies/${company.slug}`}
              className="group flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 focus:ring-harbour-400 transition-all"
            >
              {company.logo ? (
                <div className="w-16 h-16 relative overflow-hidden bg-harbour-100">
                  <img
                    src={`/images/${company.logo}`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center">
                  <span className="text-2xl text-harbour-400">{company.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
                  {company.name}
                </h2>
                {company.location && <p className="text-sm text-harbour-400">{company.location}</p>}
              </div>
            </a>
          ))}
        </div>
      )}

      <Pagination total={total} limit={limit} offset={offset} />
    </div>
  );
}
