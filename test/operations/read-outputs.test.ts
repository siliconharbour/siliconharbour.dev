import { afterEach, it, vi } from "vitest";
import { updateDiscordConfig } from "~/lib/config.server";
import { db } from "~/db";
import {
  companies,
  people,
  education,
  groups,
  products,
  projects,
  technologies,
  events,
  jobs,
  news,
  jobImportSources,
  eventImportSources,
  newsImportSources,
} from "~/db/schema";
import { operationCatalog } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { startAsyncSync } from "~/lib/async-syncs.server";
import * as discord from "~/lib/discord.server";
import * as newsletter from "~/lib/newsletter.server";
import * as technl from "~/lib/technl-jobs.server";

afterEach(() => vi.restoreAllMocks());
it("executes every catalog read against persisted records or mocked provider boundaries", async () => {
  await db
    .insert(companies)
    .values({ id: 1, name: "Company", slug: "company", description: "Description", visible: true });
  await db
    .insert(people)
    .values({ id: 1, name: "Person", bio: "Bio", slug: "person", visible: true });
  await db
    .insert(education)
    .values({ id: 1, name: "School", slug: "school", description: "Description", visible: true });
  await db
    .insert(groups)
    .values({ id: 1, name: "Group", slug: "group", description: "Description", visible: true });
  await db
    .insert(products)
    .values({ id: 1, name: "Product", slug: "product", description: "Description" });
  await db
    .insert(projects)
    .values({ id: 1, name: "Project", slug: "project", description: "Description" });
  await db
    .insert(technologies)
    .values({ id: 1, name: "Technology", category: "language", slug: "technology", visible: true });
  await db.insert(events).values({
    id: 1,
    title: "Event",
    slug: "event",
    description: "Description",
    link: "https://example.com/event",
  });
  await db.insert(jobs).values({
    id: 1,
    title: "Job",
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    slug: "job",
    description: "Description",
    url: "https://example.com/job",
  });
  await db.insert(news).values({
    id: 1,
    title: "News",
    slug: "news",
    content: "Content",
    type: "article",
    status: "published",
  });
  await db
    .insert(jobImportSources)
    .values({ id: 1, companyId: 1, sourceType: "greenhouse", sourceIdentifier: "example" });
  await db.insert(eventImportSources).values({
    id: 1,
    name: "Events",
    sourceType: "luma-calendar",
    sourceIdentifier: "example",
    sourceUrl: "https://example.com/events",
  });
  await db.insert(newsImportSources).values({
    id: 1,
    name: "News",
    sourceType: "rss",
    sourceUrl: "https://example.com/news",
  });
  await updateDiscordConfig({ botToken: "test-token" });
  vi.spyOn(discord, "listGuilds").mockResolvedValue({ ok: true, guilds: [] });
  vi.spyOn(discord, "listPostableChannels").mockResolvedValue({ ok: true, channels: [] });
  const posting: technl.TechNLJobWithMatch = {
    link: "https://technl.ca/job/example",
    title: "Job",
    company: "Company",
    location: null,
    jobType: null,
    salary: null,
    descriptionHtml: "Content",
    descriptionText: "Content",
    postedAt: new Date().toISOString(),
    match: {
      companyId: null,
      companySlug: null,
      companyVisible: null,
      alreadyImported: false,
      matchedJobId: null,
      matchedJobStatus: null,
      duplicateConfidence: null,
      companyHasJobSource: false,
    },
  };
  const run = startAsyncSync([], adminContext(1).actor);
  const inputs: Record<string, unknown> = {
    educationPublicGet: { slug: "school" },
    asyncSyncGet: { id: run.id },
    discordChannelsList: { guildId: "123" },
    jobTechNLGet: { link: posting.link },
  };
  const campaign: newsletter.Campaign = {
    id: 1,
    subject: "Subject",
    bodyMarkdown: "Content",
    fromAddress: "hello@example.com",
    fromName: null,
    audienceType: "list",
    audienceId: 1,
    audienceData: { testSubscriberIds: [1] },
    status: "draft",
    createdAt: new Date().toISOString(),
    sentAt: null,
    lastError: null,
  };
  vi.spyOn(newsletter, "isNewsletterConfigured").mockReturnValue(true);
  vi.spyOn(newsletter, "getNewsletterStats").mockResolvedValue({
    listId: 1,
    confirmed: 1,
    unconfirmed: 0,
    unsubscribed: 0,
  });
  vi.spyOn(newsletter, "getNewsletterList").mockResolvedValue({
    id: 1,
    name: "List",
    slug: "siliconharbour",
    fromDomain: "example.com",
    fromAddress: "hello@example.com",
  });
  vi.spyOn(newsletter, "getNewsletterCampaign").mockResolvedValue(campaign);
  vi.spyOn(newsletter, "getNewsletterPreview").mockResolvedValue({
    subject: "Subject",
    html: null,
    text: "Content",
  });
  vi.spyOn(newsletter, "getConfirmedPilotSubscriberIds").mockResolvedValue([1]);
  vi.spyOn(newsletter, "getNewsletterSends").mockResolvedValue([]);
  vi.spyOn(newsletter, "listNewsletterCampaigns").mockResolvedValue({
    items: [campaign],
    total: null,
    nextOffset: null,
  });
  vi.spyOn(newsletter, "listNewsletterSubscribers").mockResolvedValue({
    items: [],
    total: null,
    nextOffset: null,
  });
  vi.spyOn(technl, "getTechNLJobsPage").mockResolvedValue({
    items: [],
    total: 0,
    nextOffset: null,
    fetchedAt: new Date().toISOString(),
  });
  vi.spyOn(technl, "fetchTechNLJobsWithMatches").mockResolvedValue({
    jobs: [posting],
    fetchedAt: new Date().toISOString(),
  });
  for (const op of Object.values(operationCatalog).filter((op) => op.risk === "read")) {
    const input = inputs[op.name] ?? op.examples[0].input;
    await op.execute(adminContext(1), input);
  }
});
