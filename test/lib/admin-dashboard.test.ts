import { describe, expect, it } from "vitest";
import { db } from "~/db";
import {
  companies,
  eventImportSources,
  jobImportSources,
  newsImportSources,
} from "~/db/schema";
import { getAdminDashboardCounts } from "~/lib/admin-dashboard.server";

describe("admin dashboard import health", () => {
  it("returns failed event, job, and enabled news sources with actionable details", async () => {
    const now = new Date("2026-08-28T12:00:00Z");
    const [company] = await db
      .insert(companies)
      .values({ slug: "spellbook", name: "Spellbook", description: "" })
      .returning();

    const [eventSource] = await db
      .insert(eventImportSources)
      .values({
        name: "Community events",
        sourceType: "meetup",
        sourceIdentifier: "community",
        sourceUrl: "https://example.com/events",
        fetchStatus: "error",
        fetchError: "Event feed unavailable",
        lastFetchedAt: now,
      })
      .returning();
    const [jobSource] = await db
      .insert(jobImportSources)
      .values({
        companyId: company.id,
        sourceType: "ashby",
        sourceIdentifier: "spellbook.legal",
        fetchStatus: "error",
        fetchError: "Job board not found",
        lastFetchedAt: now,
      })
      .returning();
    const [newsSource] = await db
      .insert(newsImportSources)
      .values({
        name: "Local news",
        sourceType: "rss",
        sourceUrl: "https://example.com/feed.xml",
        enabled: true,
        lastSyncStatus: "error",
        lastSyncError: "Invalid feed",
        lastSyncAt: now,
      })
      .returning();

    await db.insert(newsImportSources).values({
      name: "Disabled feed",
      sourceType: "rss",
      sourceUrl: "https://example.com/disabled.xml",
      enabled: false,
      lastSyncStatus: "error",
      lastSyncError: "Expected while disabled",
    });

    const dashboard = await getAdminDashboardCounts();

    expect(dashboard.importFailures).toEqual([
      expect.objectContaining({
        id: eventSource.id,
        kind: "event",
        name: "Community events",
        error: "Event feed unavailable",
        href: `/manage/import/events/${eventSource.id}`,
      }),
      expect.objectContaining({
        id: jobSource.id,
        kind: "job",
        name: "Spellbook",
        error: "Job board not found",
        href: `/manage/import/jobs/${jobSource.id}`,
      }),
      expect.objectContaining({
        id: newsSource.id,
        kind: "news",
        name: "Local news",
        error: "Invalid feed",
        href: `/manage/import/news/${newsSource.id}`,
      }),
    ]);
  });

  it("returns no failures when sources are healthy", async () => {
    const dashboard = await getAdminDashboardCounts();
    expect(dashboard.importFailures).toEqual([]);
  });
});
