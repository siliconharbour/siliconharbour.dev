import { count, eq } from "drizzle-orm";
import { db } from "~/db";
import {
  comments,
  companies,
  education,
  events,
  groups,
  jobs,
  news,
  people,
  products,
  projects,
  technologies,
} from "~/db/schema";

async function tableCount(table: typeof events | typeof companies | typeof groups | typeof education | typeof people | typeof news | typeof jobs | typeof projects | typeof products | typeof technologies | typeof comments) {
  const [result] = await db.select({ total: count() }).from(table);
  return result.total;
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
  };
}
