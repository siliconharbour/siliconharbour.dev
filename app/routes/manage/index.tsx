import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getAllEvents } from "~/lib/events.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Manage - siliconharbour.dev" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user } = await requireAuth(request);
  const events = await getAllEvents();
  return { user, eventCount: events.length };
}

export default function ManageIndex() {
  const { user, eventCount } = useLoaderData<typeof loader>();

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
          <Link
            to="/manage/logout"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            Logout
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            to="/manage/events"
            className="p-6 bg-white border border-harbour-200 hover:border-harbour-400 transition-colors flex flex-col gap-2"
          >
            <h2 className="text-lg font-semibold text-harbour-700">Events</h2>
            <p className="text-harbour-400 text-sm">
              {eventCount} event{eventCount !== 1 ? "s" : ""}
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
