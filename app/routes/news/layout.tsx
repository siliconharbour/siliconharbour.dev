import type { Route } from "./+types/layout";
import { Link, Outlet, useLocation } from "react-router";

const filters = [
  { path: "/news", label: "All", exact: true },
  { path: "/news/links", label: "Links" },
  { path: "/news/articles", label: "Articles" },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "News - siliconharbour.dev" },
    { name: "description", content: "News and announcements from the St. John's tech community" },
  ];
}

export default function NewsLayout() {
  const location = useLocation();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-6">
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
                  isActive ? "bg-harbour-600 text-white" : "text-harbour-600 hover:bg-harbour-50"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}
        </div>
        <Outlet />
      </div>
    </div>
  );
}
