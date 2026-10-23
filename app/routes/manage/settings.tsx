import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";
import type { Route } from "./+types/settings";
import { Form, Link, useActionData, useLoaderData, useFetcher } from "react-router";
import { useState } from "react";
import { requireAdmin } from "~/lib/session.server";
import {
  getSectionVisibility,
  updateSectionVisibility,
  getCommentVisibility,
  updateCommentVisibility,
  getDiscordConfig,
  updateDiscordConfig,
  getNewsGlobalKeywords,
  type SectionVisibility,
  type CommentVisibility,
} from "~/lib/config.server";
import {
  listDestinations,
  addDestination,
  removeDestination,
} from "~/lib/discord-destinations.server";
import {
  sectionKeys,
  type SectionKey,
  commentableKeys,
  type CommentableKey,
  discordChannelTypes,
  type DiscordChannelType,
  type DiscordDestination,
} from "~/db/schema";
import { getEventTagsWithUsage } from "~/lib/event-tags.server";
import { EventTagSettings } from "~/components/manage/EventTagSettings";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Settings - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [
    visibility,
    commentVisibility,
    discordConfig,
    eventsDestinations,
    jobsDestinations,
    newsGlobalKeywords,
    eventTags,
  ] = await Promise.all([
    getSectionVisibility(),
    getCommentVisibility(),
    getDiscordConfig(),
    listDestinations("events"),
    listDestinations("jobs"),
    getNewsGlobalKeywords(),
    getEventTagsWithUsage(),
  ]);
  return {
    visibility,
    commentVisibility,
    discordConfig,
    discordDestinations: { events: eventsDestinations, jobs: jobsDestinations },
    newsGlobalKeywords,
    eventTags,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();

  const intent = formData.get("intent");

  if (intent === "add-event-tag" || intent === "update-event-tag") {
    const result = await runAdminOperation(request, operationCatalog.eventTagSave, {
      ...(intent === "update-event-tag" && { id: Number(formData.get("tagId")) }),
      name: formData.get("name"),
      color: formData.get("color"),
    });
    return result.ok ? { intent, success: true } : { intent, error: result.error };
  }
  if (intent === "delete-event-tag") {
    const result = await runAdminOperation(request, operationCatalog.eventTagDelete, {
      id: Number(formData.get("tagId")),
      confirm: true,
    });
    return result.ok ? { intent, success: true } : { intent, error: result.error };
  }

  if (intent === "test-discord") {
    const token = formData.get("discord_bot_token");
    if (!token || typeof token !== "string") {
      return { success: false, discordTest: { valid: false, error: "No token provided" } };
    }
    const { verifyBotToken, listGuilds } = await import("~/lib/discord.server");
    const verifyResult = await verifyBotToken(token);
    if (!verifyResult.valid) {
      return { success: false, discordTest: verifyResult };
    }
    const guildsResult = await listGuilds(token);
    return {
      success: false,
      discordTest: {
        ...verifyResult,
        guildCount: guildsResult.guilds?.length ?? 0,
      },
    };
  }

  if (intent === "load-guilds") {
    const config = await getDiscordConfig();
    if (!config.botToken) {
      return { intent: "load-guilds" as const, error: "Bot token not configured" };
    }
    const { listGuilds } = await import("~/lib/discord.server");
    const result = await listGuilds(config.botToken);
    if (!result.ok) {
      return { intent: "load-guilds" as const, error: result.error ?? "Failed to load guilds" };
    }
    return {
      intent: "load-guilds" as const,
      guilds: (result.guilds ?? []).map((g) => ({ id: g.id, name: g.name })),
    };
  }

  if (intent === "load-channels") {
    const guildId = formData.get("guildId");
    if (typeof guildId !== "string" || !guildId) {
      return { intent: "load-channels" as const, error: "Missing guild ID" };
    }
    const config = await getDiscordConfig();
    if (!config.botToken) {
      return { intent: "load-channels" as const, error: "Bot token not configured" };
    }
    const { listPostableChannels } = await import("~/lib/discord.server");
    const result = await listPostableChannels(guildId, config.botToken);
    if (!result.ok) {
      return { intent: "load-channels" as const, error: result.error ?? "Failed to load channels" };
    }
    return {
      intent: "load-channels" as const,
      guildId,
      channels: result.channels ?? [],
    };
  }

  if (intent === "add-destination") {
    const type = formData.get("type");
    const guildId = formData.get("guildId");
    const guildName = formData.get("guildName");
    const channelId = formData.get("channelId");
    const channelName = formData.get("channelName");
    if (
      typeof type !== "string" ||
      !(discordChannelTypes as readonly string[]).includes(type) ||
      typeof guildId !== "string" ||
      typeof guildName !== "string" ||
      typeof channelId !== "string" ||
      typeof channelName !== "string" ||
      !guildId ||
      !channelId
    ) {
      return { intent: "add-destination" as const, error: "Invalid destination" };
    }
    await addDestination({
      type: type as DiscordChannelType,
      guildId,
      guildName,
      channelId,
      channelName,
    });
    return { intent: "add-destination" as const, success: true };
  }

  if (intent === "remove-destination") {
    const id = Number(formData.get("destinationId"));
    if (!id) return { intent: "remove-destination" as const, error: "Invalid destination" };
    await removeDestination(id);
    return { intent: "remove-destination" as const, success: true };
  }

  // Default: save the main settings form
  const sectionUpdates: Partial<SectionVisibility> = {};
  for (const section of sectionKeys) {
    sectionUpdates[section] = formData.has(section);
  }

  const commentUpdates: Partial<CommentVisibility> = {};
  for (const contentType of commentableKeys) {
    commentUpdates[contentType] = formData.has(`comments_${contentType}`);
  }

  const discordUpdates: Partial<{ botToken: string }> = {};
  const botToken = formData.get("discord_bot_token");
  if (typeof botToken === "string") discordUpdates.botToken = botToken;

  const newsKeywords = formData.get("news_global_keywords");
  if (typeof newsKeywords === "string") {
    const result = await runAdminOperation(request, operationCatalog.newsGlobalKeywordsSet, {
      keywords: newsKeywords,
    });
    if (!result.ok) return { error: result.error };
  }

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

// =============================================================================
// Destination picker subcomponent
// =============================================================================

interface DestinationPickerProps {
  type: DiscordChannelType;
  destinations: DiscordDestination[];
}

interface Guild {
  id: string;
  name: string;
}

interface PostableChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  parentId: string | null;
  canSend: boolean;
  reason?: string;
}

function DestinationPicker({ type, destinations }: DestinationPickerProps) {
  const [adding, setAdding] = useState(false);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const guildsFetcher = useFetcher<{ guilds?: Guild[]; error?: string }>();
  const channelsFetcher = useFetcher<{
    channels?: PostableChannel[];
    error?: string;
    guildId?: string;
  }>();
  const mutateFetcher = useFetcher<{ success?: boolean; error?: string }>();

  const isLoadingGuilds = guildsFetcher.state !== "idle";
  const isLoadingChannels = channelsFetcher.state !== "idle";
  const guildList = guildsFetcher.data?.guilds;
  const guildError = guildsFetcher.data?.error;
  const channelList = channelsFetcher.data?.channels;
  const channelError = channelsFetcher.data?.error;

  function openPicker() {
    setAdding(true);
    if (!guildList && !isLoadingGuilds) {
      const fd = new FormData();
      fd.set("intent", "load-guilds");
      guildsFetcher.submit(fd, { method: "post" });
    }
  }

  function pickGuild(guild: Guild) {
    setSelectedGuild(guild);
    const fd = new FormData();
    fd.set("intent", "load-channels");
    fd.set("guildId", guild.id);
    channelsFetcher.submit(fd, { method: "post" });
  }

  function addChannel(guild: Guild, channel: PostableChannel) {
    const fd = new FormData();
    fd.set("intent", "add-destination");
    fd.set("type", type);
    fd.set("guildId", guild.id);
    fd.set("guildName", guild.name);
    fd.set("channelId", channel.id);
    fd.set("channelName", channel.name);
    mutateFetcher.submit(fd, { method: "post" });
    // Optimistically close picker; the loader will re-run via the action.
    setAdding(false);
    setSelectedGuild(null);
  }

  function removeOne(destinationId: number) {
    const fd = new FormData();
    fd.set("intent", "remove-destination");
    fd.set("destinationId", String(destinationId));
    mutateFetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="flex flex-col gap-gap-2">
      {destinations.length === 0 ? (
        <p className="text-sm text-subtle italic">No destinations configured.</p>
      ) : (
        <ul className="flex flex-col">
          {destinations.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between py-pad-2 px-pad-3 border border-harbour-100 -mt-px first:mt-0"
            >
              <div className="flex flex-col">
                <span className="text-sm text-heading">
                  {d.guildName} <span className="font-medium">#{d.channelName}</span>
                </span>
                <span className="text-xs text-subtle">Channel ID: {d.channelId}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove ${d.guildName} #${d.channelName}?`)) removeOne(d.id);
                }}
                className="text-xs px-pad-2 py-pad-1 border border-line text-subtle hover:text-red-600 hover:border-red-300 transition-colors"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {!adding && (
        <button
          type="button"
          onClick={openPicker}
          className="self-start text-xs px-pad-3 py-pad-1-5 border border-line text-body hover:bg-soft transition-colors"
        >
          + Add destination
        </button>
      )}

      {adding && (
        <div className="border border-line p-pad-3 flex flex-col gap-gap-2 bg-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-heading uppercase tracking-wide">
              {selectedGuild ? `Channel in ${selectedGuild.name}` : "Pick a server"}
            </span>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setSelectedGuild(null);
              }}
              className="text-xs text-subtle hover:text-body"
            >
              Cancel
            </button>
          </div>

          {!selectedGuild && (
            <>
              {isLoadingGuilds && <p className="text-xs text-subtle">Loading servers…</p>}
              {guildError && <p className="text-xs text-red-700">Error: {guildError}</p>}
              {guildList && guildList.length === 0 && (
                <p className="text-xs text-subtle">Bot is not in any servers. Invite it first.</p>
              )}
              {guildList && guildList.length > 0 && (
                <ul className="flex flex-col">
                  {guildList.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => pickGuild(g)}
                        className="w-full text-left px-pad-3 py-pad-2 text-sm border border-line -mt-px first:mt-0 bg-surface hover:bg-tint transition-colors text-heading"
                      >
                        {g.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {selectedGuild && (
            <>
              <button
                type="button"
                onClick={() => setSelectedGuild(null)}
                className="self-start text-xs text-subtle hover:text-body"
              >
                ← Back to servers
              </button>
              {isLoadingChannels && <p className="text-xs text-subtle">Loading channels…</p>}
              {channelError && <p className="text-xs text-red-700">Error: {channelError}</p>}
              {channelList && channelList.length === 0 && (
                <p className="text-xs text-subtle">
                  No text channels visible to the bot in this server.
                </p>
              )}
              {channelList && channelList.length > 0 && (
                <ul className="flex flex-col">
                  {channelList.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={!c.canSend}
                        onClick={() => addChannel(selectedGuild, c)}
                        title={c.reason}
                        className={`w-full text-left px-pad-3 py-pad-2 text-sm border border-line -mt-px first:mt-0 transition-colors ${
                          c.canSend
                            ? "bg-surface hover:bg-tint text-heading"
                            : "bg-tint text-subtle cursor-not-allowed"
                        }`}
                      >
                        #{c.name}
                        {!c.canSend && c.reason && (
                          <span className="ml-2 text-xs">({c.reason})</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const {
    visibility,
    commentVisibility,
    discordConfig,
    discordDestinations,
    newsGlobalKeywords,
    eventTags,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const testFetcher = useFetcher<{
    discordTest?: { valid: boolean; username?: string; error?: string; guildCount?: number };
  }>();
  const discordTestResult = testFetcher.data?.discordTest;

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-gap-1">
            <h1 className="text-2xl font-semibold text-heading">Settings</h1>
            <p className="text-subtle text-sm">Configure site visibility and features</p>
          </div>
          <Link to="/manage" className="text-sm text-subtle hover:text-body">
            Back to Dashboard
          </Link>
        </div>

        <EventTagSettings
          tags={eventTags}
          error={actionData && "error" in actionData ? actionData.error : undefined}
        />

        <Form method="post" className="flex flex-col gap-gap-6">
          <div className="bg-surface border border-line p-pad-6 rounded-panel">
            <h2 className="text-lg font-semibold text-heading mb-4">Section Visibility</h2>
            <p className="text-sm text-subtle mb-6">
              Toggle which sections appear in navigation and on the home page. Hidden sections will
              still be accessible via direct URL.
            </p>

            <div className="flex flex-col gap-gap-4">
              {sectionKeys.map((section) => (
                <label
                  key={section}
                  className="flex items-start gap-gap-4 p-pad-4 border border-harbour-100 hover:border-line cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    name={section}
                    defaultChecked={visibility[section]}
                    className="mt-1 h-4 w-4 text-body border border-harbour-300 focus:ring-harbour-500"
                  />
                  <div className="flex flex-col gap-gap-1">
                    <span className="font-medium text-heading">{sectionLabels[section]}</span>
                    <span className="text-sm text-subtle">{sectionDescriptions[section]}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-line p-pad-6 rounded-panel">
            <h2 className="text-lg font-semibold text-heading mb-4">Comments</h2>
            <p className="text-sm text-subtle mb-6">
              Toggle which pages allow user comments. Disabling comments hides the comment section
              from public view but preserves existing comments.
            </p>

            <div className="flex flex-col gap-gap-4">
              {commentableKeys.map((contentType) => (
                <label
                  key={contentType}
                  className="flex items-start gap-gap-4 p-pad-4 border border-harbour-100 hover:border-line cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    name={`comments_${contentType}`}
                    defaultChecked={commentVisibility[contentType]}
                    className="mt-1 h-4 w-4 text-body border border-harbour-300 focus:ring-harbour-500"
                  />
                  <div className="flex flex-col gap-gap-1">
                    <span className="font-medium text-heading">
                      {commentableLabels[contentType]}
                    </span>
                    <span className="text-sm text-subtle">
                      {commentableDescriptions[contentType]}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-line p-pad-6 rounded-panel">
            <h2 className="text-lg font-semibold text-heading mb-4">News Import</h2>
            <p className="text-sm text-subtle mb-4">
              Global keywords for filtering news import sources. Sources with &quot;Use global
              keywords&quot; enabled will use this list instead of per-source keywords.
            </p>
            <div className="flex flex-col gap-gap-2">
              <label htmlFor="news_global_keywords" className="font-medium text-heading text-sm">
                Global Keywords
              </label>
              <input
                type="text"
                id="news_global_keywords"
                name="news_global_keywords"
                defaultValue={newsGlobalKeywords}
                placeholder="tech, startup, innovation, AI, software, digital, venture, funding, TechNL, Genesis, Bounce"
                className="w-full px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:border-harbour-500 text-sm"
              />
              <p className="text-xs text-subtle">
                Comma-separated. Applied to title and excerpt (case-insensitive).
              </p>
            </div>
          </div>

          <div className="bg-surface border border-line p-pad-6 rounded-panel">
            <h2 className="text-lg font-semibold text-heading mb-4">Discord</h2>
            <p className="text-sm text-subtle mb-6">
              Configure the Discord bot and pick which channels event and job roundups should be
              posted to. Roundups fan out to every configured destination for their content type.
            </p>

            <div className="flex flex-col gap-gap-6">
              <div className="flex flex-col gap-gap-2">
                <label htmlFor="discord_bot_token" className="font-medium text-heading text-sm">
                  Bot Token
                </label>
                <div className="flex gap-gap-2">
                  <input
                    type="password"
                    id="discord_bot_token"
                    name="discord_bot_token"
                    defaultValue={discordConfig.botToken}
                    placeholder="Enter Discord bot token"
                    className="flex-1 px-pad-3 py-pad-2 border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-harbour-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const tokenInput = document.getElementById(
                        "discord_bot_token",
                      ) as HTMLInputElement;
                      const formData = new FormData();
                      formData.set("intent", "test-discord");
                      formData.set("discord_bot_token", tokenInput?.value ?? "");
                      testFetcher.submit(formData, { method: "post" });
                    }}
                    className="px-pad-3 py-pad-2 text-sm border border-line text-body hover:bg-soft transition-colors whitespace-nowrap"
                  >
                    {testFetcher.state === "submitting" ? "Testing..." : "Test Connection"}
                  </button>
                </div>
                {discordTestResult && (
                  <p
                    className={`text-sm ${discordTestResult.valid ? "text-green-700" : "text-red-700"}`}
                  >
                    {discordTestResult.valid
                      ? `Connected as ${discordTestResult.username} — bot is in ${discordTestResult.guildCount ?? 0} server${discordTestResult.guildCount === 1 ? "" : "s"}`
                      : `Connection failed: ${discordTestResult.error || "Invalid token"}`}
                  </p>
                )}
                <p className="text-xs text-subtle">
                  After saving a new token, click Test Connection to refresh the bot&apos;s server
                  list.
                </p>
              </div>

              <div className="flex flex-col gap-gap-2">
                <span className="font-medium text-heading text-sm">Event Destinations</span>
                <p className="text-xs text-subtle">
                  Channels that receive event roundups. Posting will go to every channel listed
                  here.
                </p>
                <DestinationPicker type="events" destinations={discordDestinations.events} />
              </div>

              <div className="flex flex-col gap-gap-2">
                <span className="font-medium text-heading text-sm">Job Destinations</span>
                <p className="text-xs text-subtle">
                  Channels that receive job roundups. Posting will go to every channel listed here.
                </p>
                <DestinationPicker type="jobs" destinations={discordDestinations.jobs} />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-pad-6 py-pad-2 bg-primary text-white hover:bg-primary-hover transition-colors"
            >
              Save Changes
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
