import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllEvents } from "~/lib/events.server";
import { getAllCompanies } from "~/lib/companies.server";
import { getAllGroups } from "~/lib/groups.server";
import { getAllLearning } from "~/lib/learning.server";
import { getAllPeople } from "~/lib/people.server";
import { getAllNews } from "~/lib/news.server";
import { getAllJobs } from "~/lib/jobs.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Manage - siliconharbour.dev" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user } = await requireAuth(request);
  const [events, companies, groups, learning, people, news, jobs] = await Promise.all([
    getAllEvents(),
    getAllCompanies(),
    getAllGroups(),
    getAllLearning(),
    getAllPeople(),
    getAllNews(),
    getAllJobs(),
  ]);
  return { 
    user, 
    counts: {
      events: events.length,
      companies: companies.length,
      groups: groups.length,
      learning: learning.length,
      people: people.length,
      news: news.length,
      jobs: jobs.length,
    }
  };
}

const contentTypes = [
  { key: "events", label: "Events", href: "/manage/events" },
  { key: "companies", label: "Companies", href: "/manage/companies" },
  { key: "groups", label: "Groups", href: "/manage/groups" },
  { key: "learning", label: "Learning", href: "/manage/learning" },
  { key: "people", label: "People", href: "/manage/people" },
  { key: "news", label: "News", href: "/manage/news" },
  { key: "jobs", label: "Jobs", href: "/manage/jobs" },
] as const;

export default function ManageIndex() {
  const { user, counts } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-harbour-700">Dashboard</h1>
            <p className="text-harbour-400 text-sm">
              Welcome, {user.email}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              View Site
            </Link>
            <Link
              to="/manage/logout"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              Logout
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contentTypes.map((type) => (
            <Link
              key={type.key}
              to={type.href}
              className="p-6 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-2"
            >
              <h2 className="text-lg font-semibold text-harbour-700">{type.label}</h2>
              <p className="text-harbour-400 text-sm">
                {counts[type.key]} {type.label.toLowerCase()}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
