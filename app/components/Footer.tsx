import { Link } from "react-router";

export function Footer() {
  return (
    <footer className="border-t border-line/50 p-pad-8">
      <div className="max-w-6xl mx-auto flex flex-col gap-gap-4 sm:flex-row sm:items-center sm:justify-between text-sm text-subtle">
        <div className="flex flex-wrap gap-gap-4">
          <Link to="/stay-connected" className="link-inline hover:text-body">
            Stay Connected
          </Link>
        </div>
        <div className="flex gap-gap-4">
          <Link to="/about" className="link-inline hover:text-body">
            About
          </Link>
          <Link to="/api" className="link-inline hover:text-body">
            API
          </Link>
          <Link to="/sitemap" className="link-inline hover:text-body">
            Sitemap
          </Link>
          <Link to="/manage/login" className="link-inline hover:text-body">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
