import { Link } from "react-router";

interface PublicLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/events", label: "Events" },
  { href: "/companies", label: "Companies" },
  { href: "/groups", label: "Groups" },
  { href: "/projects", label: "Projects" },
  { href: "/learning", label: "Learning" },
  { href: "/people", label: "People" },
  { href: "/news", label: "News" },
  { href: "/jobs", label: "Jobs" },
];

export function PublicLayout({ children }: PublicLayoutProps) {
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
            {navItems.map((item) => (
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
        {children}
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
