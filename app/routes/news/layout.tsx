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
    <div className="max-w-6xl mx-auto p-pad-4 py-pad-8">
      <div className="flex flex-col gap-gap-6">
        <div className="flex flex-wrap items-center gap-gap-4">
          {filters.map((filter) => {
            const isActive = filter.exact
              ? location.pathname === filter.path
              : location.pathname.startsWith(filter.path);
            return (
              <Link
                key={filter.path}
                to={filter.path}
                className={`px-pad-3 py-pad-1-5 text-sm font-medium transition-colors ${
                  isActive ? "bg-primary text-white" : "text-body hover:bg-soft"
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
