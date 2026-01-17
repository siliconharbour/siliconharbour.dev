import type { Route } from "./+types/public-layout";
import { useState } from "react";
import { Link, Outlet, useLoaderData, useLocation } from "react-router";
import { getSectionVisibility, type SectionVisibility } from "~/lib/config.server";
import type { SectionKey } from "~/db/schema";
import { Footer } from "~/components/Footer";

export async function loader({}: Route.LoaderArgs) {
  const visibility = await getSectionVisibility();
  return { visibility };
}

// Nav items with optional keys for visibility check
// Items without keys are always shown
const navItems: { href: string; label: string; keys?: SectionKey[] }[] = [
  { href: "/events", label: "Events", keys: ["events"] },
  { href: "/directory", label: "Directory", keys: ["companies", "groups", "people", "products", "projects", "learning"] },
  { href: "/news", label: "News", keys: ["news"] },
  { href: "/jobs", label: "Jobs", keys: ["jobs"] },
];

export default function PublicLayoutRoute() {
  const { visibility } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Filter nav items based on visibility config
  // Show item if any of its keys are visible (or if no keys specified)
  const visibleNavItems = navItems.filter((item) => {
    if (!item.keys) return true;
    return item.keys.some(key => visibility[key]);
  });

  // Check if nav item is active
  const isNavItemActive = (item: typeof navItems[number]) => {
    return location.pathname.startsWith(item.href);
  };

  // Close mobile menu on navigation
  const handleNavClick = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-harbour-200/50">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img 
              src="/siliconharbour.svg" 
              alt="Silicon Harbour" 
              className="h-8 w-auto"
            />
            <span className="font-semibold text-harbour-700">siliconharbour.dev</span>
          </Link>
          
          {/* Desktop nav */}
          <nav className="hidden md:flex gap-4">
            {visibleNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`link-inline text-sm hover:text-harbour-700 ${
                  isNavItemActive(item)
                    ? "text-harbour-700 font-medium" 
                    : "text-harbour-500"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Mobile hamburger button */}
          <button
            type="button"
            className="md:hidden p-2 -mr-2 text-harbour-500 hover:text-harbour-700"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-harbour-200/50 bg-white">
            <div className="max-w-6xl mx-auto px-4 py-2 flex flex-col">
              {visibleNavItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={handleNavClick}
                  className={`link-inline py-3 text-sm border-b border-harbour-100 last:border-0 hover:text-harbour-700 ${
                    isNavItemActive(item)
                      ? "text-harbour-700 font-medium"
                      : "text-harbour-500"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet context={{ visibility }} />
      </main>

      <Footer />
    </div>
  );
}

// Hook for child routes to access visibility
export function useVisibility(): SectionVisibility {
  // This will be used by child routes via useOutletContext
  // Import from react-router: useOutletContext
  return {} as SectionVisibility; // Placeholder - actual usage via useOutletContext
}
