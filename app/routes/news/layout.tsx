import type { Route } from "./+types/layout";
import { Link, Outlet, useLocation } from "react-router";
import { useLoaderData } from "react-router";
import { getOptionalUser } from "~/lib/session.server";

const filters = [
  { path: "/news", label: "All", exact: true },
  { path: "/news/announcements", label: "Announcements" },
  { path: "/news/general", label: "General" },
  { path: "/news/editorial", label: "Editorial" },
  { path: "/news/updates", label: "Site Updates" },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "News - siliconharbour.dev" },
    { name: "description", content: "News and announcements from the St. John's tech community" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  return { isAdmin };
}

export default function NewsLayout() {
  const location = useLocation();
  const { isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-6">
        {/* Filter Buttons + Admin Button */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {filters.map((filter) => {
              const isActive = filter.exact 
                ? location.pathname === filter.path
                : location.pathname.startsWith(filter.path);
              return (
                <Link
                  key={filter.path}
                  to={filter.path}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-harbour-600 text-white"
                      : "text-harbour-600 hover:bg-harbour-50"
                  }`}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>
          {isAdmin && (
            <Link
              to="/manage/news/new"
              className="px-3 py-1.5 text-sm bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
            >
              + New Article
            </Link>
          )}
        </div>

        <Outlet />
      </div>
    </div>
  );
}
