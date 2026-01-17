import type { Route } from "./+types/layout";
import { Link, Outlet, useLocation } from "react-router";

const tabs = [
  { path: "/directory/companies", label: "Companies" },
  { path: "/directory/groups", label: "Groups" },
  { path: "/directory/learning", label: "Learning" },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Directory - siliconharbour.dev" },
    { name: "description", content: "Directory of companies, groups, and learning resources in St. John's tech community" },
  ];
}

export default function DirectoryLayout() {
  const location = useLocation();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">Directory</h1>
            <p className="text-harbour-500">Companies, groups, and learning resources in the tech community</p>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-1 border-b border-harbour-200">
            {tabs.map((tab) => (
              <Link
                key={tab.path}
                to={tab.path}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  location.pathname.startsWith(tab.path)
                    ? "border-harbour-600 text-harbour-700"
                    : "border-transparent text-harbour-400 hover:text-harbour-600"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        <Outlet />
      </div>
    </div>
  );
}
