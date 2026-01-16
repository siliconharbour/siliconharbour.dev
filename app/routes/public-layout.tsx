import type { Route } from "./+types/public-layout";
import { Link, Outlet, useLoaderData } from "react-router";
import { getSectionVisibility, type SectionVisibility } from "~/lib/config.server";
import type { SectionKey } from "~/db/schema";

export async function loader({}: Route.LoaderArgs) {
  const visibility = await getSectionVisibility();
  return { visibility };
}

const navItems: { href: string; label: string; key: SectionKey }[] = [
  { href: "/events", label: "Events", key: "events" },
  { href: "/companies", label: "Companies", key: "companies" },
  { href: "/groups", label: "Groups", key: "groups" },
  { href: "/projects", label: "Projects", key: "projects" },
  { href: "/learning", label: "Learning", key: "learning" },
  { href: "/people", label: "People", key: "people" },
  { href: "/news", label: "News", key: "news" },
  { href: "/jobs", label: "Jobs", key: "jobs" },
];

export default function PublicLayoutRoute() {
  const { visibility } = useLoaderData<typeof loader>();
  
  // Filter nav items based on visibility config
  const visibleNavItems = navItems.filter((item) => visibility[item.key]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-harbour-200/50">
        <div className="max-w-6xl mx-auto p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <img 
              src="/siliconharbour.svg" 
              alt="Silicon Harbour" 
              className="h-8 w-auto"
            />
            <span className="font-semibold text-harbour-700">siliconharbour.dev</span>
          </Link>
          
          <nav className="flex flex-wrap gap-4">
            {visibleNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="text-sm text-harbour-500 hover:text-harbour-700 no-underline"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet context={{ visibility }} />
      </main>

      <footer className="border-t border-harbour-200/50 p-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-sm text-harbour-400">
          <div className="flex flex-wrap gap-4">
            <a href="/feed.rss" className="hover:text-harbour-600">RSS Feed</a>
            <a href="/calendar.ics" className="hover:text-harbour-600">Calendar</a>
          </div>
          <Link to="/manage/login" className="hover:text-harbour-600 no-underline">
            Admin
          </Link>
        </div>
      </footer>
    </div>
  );
}

// Hook for child routes to access visibility
export function useVisibility(): SectionVisibility {
  // This will be used by child routes via useOutletContext
  // Import from react-router: useOutletContext
  return {} as SectionVisibility; // Placeholder - actual usage via useOutletContext
}
