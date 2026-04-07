import type { Route } from "./+types/settings";
import { Form, Link, useLoaderData, useFetcher } from "react-router";
import { requireAuth } from "~/lib/session.server";
import {
  getSectionVisibility,
  updateSectionVisibility,
  getCommentVisibility,
  updateCommentVisibility,
  getDiscordConfig,
  updateDiscordConfig,
  type SectionVisibility,
  type CommentVisibility,
} from "~/lib/config.server";
import { sectionKeys, type SectionKey, commentableKeys, type CommentableKey } from "~/db/schema";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Settings - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [visibility, commentVisibility, discordConfig] = await Promise.all([
    getSectionVisibility(),
    getCommentVisibility(),
    getDiscordConfig(),
  ]);
  return { visibility, commentVisibility, discordConfig };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();

  const intent = formData.get("intent");
  if (intent === "test-discord") {
    const token = formData.get("discord_bot_token");
    if (!token || typeof token !== "string") {
      return { success: false, discordTest: { valid: false, error: "No token provided" } };
    }
    const { verifyBotToken } = await import("~/lib/discord.server");
    const result = await verifyBotToken(token);
    return { success: false, discordTest: result };
  }

  const sectionUpdates: Partial<SectionVisibility> = {};
  for (const section of sectionKeys) {
    sectionUpdates[section] = formData.has(section);
  }

  const commentUpdates: Partial<CommentVisibility> = {};
  for (const contentType of commentableKeys) {
    commentUpdates[contentType] = formData.has(`comments_${contentType}`);
  }

  const discordUpdates: Partial<{
    botToken: string;
    eventsChannelId: string;
    jobsChannelId: string;
  }> = {};
  const botToken = formData.get("discord_bot_token");
  const eventsChannelId = formData.get("discord_events_channel_id");
  const jobsChannelId = formData.get("discord_jobs_channel_id");
  if (typeof botToken === "string") discordUpdates.botToken = botToken;
  if (typeof eventsChannelId === "string") discordUpdates.eventsChannelId = eventsChannelId;
  if (typeof jobsChannelId === "string") discordUpdates.jobsChannelId = jobsChannelId;

  await Promise.all([
    updateSectionVisibility(sectionUpdates),
    updateCommentVisibility(commentUpdates),
    updateDiscordConfig(discordUpdates),
  ]);
  return { success: true };
}

const sectionLabels: Record<SectionKey, string> = {
  events: "Events",
  companies: "Companies",
  groups: "Groups",
  projects: "Projects",
  products: "Products",
  education: "Learning",
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
  education: "Educational institutions and resources",
  people: "Community members and speakers",
  news: "Announcements and articles",
  jobs: "Employment opportunities",
};

const commentableLabels: Record<CommentableKey, string> = {
  companies: "Companies",
  groups: "Groups",
  education: "Learning",
  projects: "Projects",
  products: "Products",
  news: "News",
};

const commentableDescriptions: Record<CommentableKey, string> = {
  companies: "Allow comments on company pages",
  groups: "Allow comments on group pages",
  education: "Allow comments on learning/education pages",
  projects: "Allow comments on project pages",
  products: "Allow comments on product pages",
  news: "Allow comments on news articles",
};

export default function Settings() {
  const { visibility, commentVisibility, discordConfig } = useLoaderData<typeof loader>();
  const testFetcher = useFetcher();
  const discordTestResult = (testFetcher.data as any)?.discordTest;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-harbour-700">Settings</h1>
            <p className="text-harbour-400 text-sm">Configure site visibility and features</p>
          </div>
          <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
            Back to Dashboard
          </Link>
        </div>

        <Form method="post" className="flex flex-col gap-6">
          <div className="bg-white border border-harbour-200 p-6">
            <h2 className="text-lg font-semibold text-harbour-700 mb-4">Section Visibility</h2>
            <p className="text-sm text-harbour-400 mb-6">
              Toggle which sections appear in navigation and on the home page. Hidden sections will
              still be accessible via direct URL.
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
                    className="mt-1 h-4 w-4 text-harbour-600 border border-harbour-300 focus:ring-harbour-500"
                  />
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-harbour-700">{sectionLabels[section]}</span>
                    <span className="text-sm text-harbour-400">{sectionDescriptions[section]}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white border border-harbour-200 p-6">
            <h2 className="text-lg font-semibold text-harbour-700 mb-4">Comments</h2>
            <p className="text-sm text-harbour-400 mb-6">
              Toggle which pages allow user comments. Disabling comments hides the comment section
              from public view but preserves existing comments.
            </p>

            <div className="flex flex-col gap-4">
              {commentableKeys.map((contentType) => (
                <label
                  key={contentType}
                  className="flex items-start gap-4 p-4 border border-harbour-100 hover:border-harbour-200 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    name={`comments_${contentType}`}
                    defaultChecked={commentVisibility[contentType]}
                    className="mt-1 h-4 w-4 text-harbour-600 border border-harbour-300 focus:ring-harbour-500"
                  />
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-harbour-700">
                      {commentableLabels[contentType]}
                    </span>
                    <span className="text-sm text-harbour-400">
                      {commentableDescriptions[contentType]}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white border border-harbour-200 p-6">
            <h2 className="text-lg font-semibold text-harbour-700 mb-4">Discord</h2>
            <p className="text-sm text-harbour-400 mb-6">
              Configure the Discord bot for posting event and job roundups to your server.
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="discord_bot_token"
                  className="font-medium text-harbour-700 text-sm"
                >
                  Bot Token
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    id="discord_bot_token"
                    name="discord_bot_token"
                    defaultValue={discordConfig.botToken}
                    placeholder="Enter Discord bot token"
                    className="flex-1 px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const tokenInput = document.getElementById(
                        "discord_bot_token"
                      ) as HTMLInputElement;
                      const formData = new FormData();
                      formData.set("intent", "test-discord");
                      formData.set("discord_bot_token", tokenInput?.value ?? "");
                      testFetcher.submit(formData, { method: "post" });
                    }}
                    className="px-3 py-2 text-sm border border-harbour-200 text-harbour-600 hover:bg-harbour-50 transition-colors whitespace-nowrap"
                  >
                    {testFetcher.state === "submitting" ? "Testing..." : "Test Connection"}
                  </button>
                </div>
                {discordTestResult && (
                  <p
                    className={`text-sm ${discordTestResult.valid ? "text-green-700" : "text-red-700"}`}
                  >
                    {discordTestResult.valid
                      ? `Connected as ${discordTestResult.username}`
                      : `Connection failed: ${discordTestResult.error || "Invalid token"}`}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="discord_events_channel_id"
                  className="font-medium text-harbour-700 text-sm"
                >
                  Events Channel ID
                </label>
                <input
                  type="text"
                  id="discord_events_channel_id"
                  name="discord_events_channel_id"
                  defaultValue={discordConfig.eventsChannelId}
                  placeholder="e.g., 1234567890123456789"
                  className="px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="discord_jobs_channel_id"
                  className="font-medium text-harbour-700 text-sm"
                >
                  Jobs Channel ID
                </label>
                <input
                  type="text"
                  id="discord_jobs_channel_id"
                  name="discord_jobs_channel_id"
                  defaultValue={discordConfig.jobsChannelId}
                  placeholder="e.g., 1234567890123456789"
                  className="px-3 py-2 border border-harbour-200 bg-white focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
                />
              </div>
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
