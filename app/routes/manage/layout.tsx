import type { Route } from "./+types/layout";
import { NavLink, Outlet } from "react-router";
import { requireAuth } from "~/lib/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { user } = await requireAuth(request);
  return { user };
}

const navigation = [
  { label: "Dashboard", to: "/manage", end: true },
  { label: "Review", to: "/manage/review" },
  { label: "Events", to: "/manage/events" },
  { label: "News", to: "/manage/news" },
  { label: "Jobs", to: "/manage/jobs" },
  { label: "Directory", to: "/manage/companies" },
  { label: "Imports", to: "/manage/import/jobs" },
] as const;

export default function ManageLayout() {
  return (
    <div className="min-h-screen bg-harbour-50">
      <header className="border-b border-harbour-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6">
          <NavLink to="/manage" className="font-semibold text-harbour-700">
            siliconharbour.dev
            <span className="ml-2 text-xs font-normal text-harbour-400">Admin</span>
          </NavLink>

          <nav aria-label="Admin" className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  `whitespace-nowrap border-b-2 px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "border-harbour-600 text-harbour-700"
                      : "border-transparent text-harbour-400 hover:border-harbour-200 hover:text-harbour-600"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4 text-sm">
            <NavLink to="/" className="text-harbour-400 hover:text-harbour-600">
              View site
            </NavLink>
            <NavLink to="/manage/settings" className="text-harbour-400 hover:text-harbour-600">
              Settings
            </NavLink>
            <NavLink to="/manage/logout" className="text-harbour-400 hover:text-harbour-600">
              Logout
            </NavLink>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
