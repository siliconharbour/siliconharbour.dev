import type { Route } from "./+types/settings";
import { Form, Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getSectionVisibility, updateSectionVisibility, type SectionVisibility } from "~/lib/config.server";
import { sectionKeys, type SectionKey } from "~/db/schema";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Settings - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const visibility = await getSectionVisibility();
  return { visibility };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  
  const updates: Partial<SectionVisibility> = {};
  for (const section of sectionKeys) {
    // Checkbox is only present in form data if checked
    updates[section] = formData.has(section);
  }
  
  await updateSectionVisibility(updates);
  return { success: true };
}

const sectionLabels: Record<SectionKey, string> = {
  events: "Events",
  companies: "Companies",
  groups: "Groups",
  projects: "Projects",
  products: "Products",
  learning: "Learning",
  people: "People",
  news: "News",
  jobs: "Jobs",
};

const sectionDescriptions: Record<SectionKey, string> = {
  events: "Tech meetups, conferences, workshops",
  companies: "Local tech companies",
  groups: "Meetups, communities, organizations",
  projects: "Community projects, apps, games, tools",
  products: "Commercial products from local companies",
  learning: "Educational institutions and resources",
  people: "Community members and speakers",
  news: "Announcements and articles",
  jobs: "Employment opportunities",
};

export default function Settings() {
  const { visibility } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-harbour-700">Settings</h1>
            <p className="text-harbour-400 text-sm">
              Configure site visibility and features
            </p>
          </div>
          <Link
            to="/manage"
            className="text-sm text-harbour-400 hover:text-harbour-600"
          >
            Back to Dashboard
          </Link>
        </div>

        <Form method="post" className="flex flex-col gap-6">
          <div className="bg-white border border-harbour-200 p-6">
            <h2 className="text-lg font-semibold text-harbour-700 mb-4">
              Section Visibility
            </h2>
            <p className="text-sm text-harbour-400 mb-6">
              Toggle which sections appear in navigation and on the home page. 
              Hidden sections will still be accessible via direct URL.
            </p>
            
            <div className="flex flex-col gap-4">
              {sectionKeys.map((section) => (
                <label
                  key={section}
                  className="flex items-start gap-4 p-4 border border-harbour-100 hover:border-harbour-200 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    name={section}
                    defaultChecked={visibility[section]}
                    className="mt-1 h-4 w-4 text-harbour-600 border-harbour-300 rounded focus:ring-harbour-500"
                  />
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-harbour-700">
                      {sectionLabels[section]}
                    </span>
                    <span className="text-sm text-harbour-400">
                      {sectionDescriptions[section]}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 bg-harbour-600 text-white hover:bg-harbour-700 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
