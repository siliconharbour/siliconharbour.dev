import { Link } from "react-router";

export function Footer() {
  return (
    <footer className="border-t border-harbour-200/50 p-8">
      <div className="max-w-6xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-sm text-harbour-400">
        <div className="flex flex-wrap gap-4">
          <Link to="/feeds" className="hover:text-harbour-600">RSS Feeds</Link>
          <Link to="/calendar" className="hover:text-harbour-600">Calendar</Link>
        </div>
        <div className="flex gap-4">
          <Link to="/about" className="hover:text-harbour-600">About</Link>
          <Link to="/manage/login" className="hover:text-harbour-600">Admin</Link>
        </div>
      </div>
    </footer>
  );
}
