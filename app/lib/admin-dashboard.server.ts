import { and, count, eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "~/db";
import {
  comments,
  companies,
  education,
  eventImportSources,
  events,
  groups,
  jobs,
  jobImportSources,
  news,
  newsImportSources,
  people,
  products,
  projects,
  technologies,
} from "~/db/schema";

async function tableCount(table: SQLiteTable) {
  const [result] = await db.select({ total: count() }).from(table);
  return result.total;
}

export type ImportFailure = {
  id: number;
  kind: "event" | "job" | "news";
  name: string;
  error: string | null;
  lastAttemptAt: Date | null;
  href: string;
};

async function getImportFailures(): Promise<ImportFailure[]> {
  const [eventFailures, jobFailures, newsFailures] = await Promise.all([
    db
      .select({
        id: eventImportSources.id,
        name: eventImportSources.name,
        error: eventImportSources.fetchError,
        lastAttemptAt: eventImportSources.lastFetchedAt,
      })
      .from(eventImportSources)
      .where(eq(eventImportSources.fetchStatus, "error")),
    db
      .select({
        id: jobImportSources.id,
        name: companies.name,
        error: jobImportSources.fetchError,
        lastAttemptAt: jobImportSources.lastFetchedAt,
      })
      .from(jobImportSources)
      .innerJoin(companies, eq(jobImportSources.companyId, companies.id))
      .where(eq(jobImportSources.fetchStatus, "error")),
    db
      .select({
        id: newsImportSources.id,
        name: newsImportSources.name,
        error: newsImportSources.lastSyncError,
        lastAttemptAt: newsImportSources.lastSyncAt,
      })
      .from(newsImportSources)
      .where(
        and(eq(newsImportSources.enabled, true), eq(newsImportSources.lastSyncStatus, "error")),
      ),
  ]);

  return [
    ...eventFailures.map((source) => ({
      ...source,
      kind: "event" as const,
      href: `/manage/import/events/${source.id}`,
    })),
    ...jobFailures.map((source) => ({
      ...source,
      kind: "job" as const,
      href: `/manage/import/jobs/${source.id}`,
    })),
    ...newsFailures.map((source) => ({
      ...source,
      kind: "news" as const,
      href: `/manage/import/news/${source.id}`,
    })),
  ];
}

export async function getAdminDashboardCounts() {
  const [
    eventCount,
    companyCount,
    groupCount,
    educationCount,
    peopleCount,
    newsCount,
    jobCount,
    projectCount,
    productCount,
    technologyCount,
    commentCount,
    pendingEventCount,
    pendingNewsCount,
    pendingJobCount,
    importFailures,
  ] = await Promise.all([
    tableCount(events),
    tableCount(companies),
    tableCount(groups),
    tableCount(education),
    tableCount(people),
    tableCount(news),
    tableCount(jobs),
    tableCount(projects),
    tableCount(products),
    tableCount(technologies),
    tableCount(comments),
    db.select({ total: count() }).from(events).where(eq(events.importStatus, "pending_review")),
    db.select({ total: count() }).from(news).where(eq(news.status, "pending_review")),
    db.select({ total: count() }).from(jobs).where(eq(jobs.status, "pending_review")),
    getImportFailures(),
  ]);

  const pending = {
    events: pendingEventCount[0].total,
    news: pendingNewsCount[0].total,
    jobs: pendingJobCount[0].total,
  };

  return {
    counts: {
      events: eventCount,
      companies: companyCount,
      groups: groupCount,
      education: educationCount,
      people: peopleCount,
      news: newsCount,
      jobs: jobCount,
      projects: projectCount,
      products: productCount,
      technologies: technologyCount,
      comments: commentCount,
    },
    pending: { ...pending, total: pending.events + pending.news + pending.jobs },
    importFailures,
  };
}
