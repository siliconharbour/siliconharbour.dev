import type { Route } from "./+types/home.md";
import { getEventsThisWeek, getUpcomingEvents } from "~/lib/events.server";
import { getRandomCompanies } from "~/lib/companies.server";
import { getPublishedNews } from "~/lib/news.server";
import { getActiveJobs } from "~/lib/jobs.server";
import { getRandomProjects } from "~/lib/projects.server";
import { markdownResponse } from "~/lib/markdown.server";
import { formatInTimezone } from "~/lib/timezone";

const SITE_URL = process.env.SITE_URL || "https://siliconharbour.dev";

export async function loader({}: Route.LoaderArgs) {
  const [thisWeek, upcoming, companies, news, jobs, projects] = await Promise.all([
    getEventsThisWeek(),
    getUpcomingEvents(),
    getRandomCompanies(4),
    getPublishedNews(),
    getActiveJobs(),
    getRandomProjects(4),
  ]);

  let content = `---
type: home
title: Silicon Harbour
url: ${SITE_URL}
description: A community tech directory for St. John's, Newfoundland & Labrador
---

# Silicon Harbour

A community tech directory for St. John's, Newfoundland & Labrador.

Discover events, companies, people, groups, jobs, news, projects, products, and educational institutions in the local tech scene.

## Navigation

- [Events](/events.md) - Tech meetups and workshops
- [Jobs](/jobs.md) - Job opportunities
- [News](/news.md) - Community news
- [Directory](/directory/companies.md) - Companies, people, groups, and more

For complete site documentation and API info, see [/llms.txt](/llms.txt).

`;

  // This Week's Events
  if (thisWeek.length > 0) {
    content += `## This Week\n\n`;
    for (const event of thisWeek) {
      const dateStr = event.dates[0]
        ? formatInTimezone(event.dates[0].startDate, "EEEE, MMMM d 'at' h:mm a")
        : "";
      content += `- [${event.title}](/events/${event.slug}.md)${dateStr ? `: ${dateStr}` : ""}\n`;
    }
    content += "\n";
  }

  // Upcoming Events
  const futureEvents = upcoming.filter((e) => !thisWeek.some((tw) => tw.id === e.id)).slice(0, 4);
  if (futureEvents.length > 0) {
    content += `## Upcoming Events\n\n`;
    for (const event of futureEvents) {
      const dateStr = event.dates[0] ? formatInTimezone(event.dates[0].startDate, "MMM d") : "";
      content += `- [${event.title}](/events/${event.slug}.md)${dateStr ? ` (${dateStr})` : ""}\n`;
    }
    content += `\n[View all events](/events.md)\n\n`;
  }

  // Latest News
  const latestNews = news.slice(0, 3);
  if (latestNews.length > 0) {
    content += `## Latest News\n\n`;
    for (const article of latestNews) {
      content += `- [${article.title}](/news/${article.slug}.md)\n`;
    }
    content += `\n[View all news](/news.md)\n\n`;
  }

  // Featured Companies
  if (companies.length > 0) {
    content += `## Featured Companies\n\n`;
    for (const company of companies) {
      content += `- [${company.name}](/directory/companies/${company.slug}.md)\n`;
    }
    content += `\n[View all companies](/directory/companies.md)\n\n`;
  }

  // Featured Projects
  if (projects.length > 0) {
    content += `## Featured Projects\n\n`;
    for (const project of projects) {
      content += `- [${project.name}](/directory/projects/${project.slug}.md)\n`;
    }
    content += `\n[View all projects](/directory/projects.md)\n\n`;
  }

  // Jobs - only show jobs that have slugs (can be linked)
  const activeJobs = jobs.filter(j => j.slug).slice(0, 4);
  if (activeJobs.length > 0) {
    content += `## Jobs\n\n`;
    for (const job of activeJobs) {
      content += `- [${job.title}](/jobs/${job.slug}.md)${job.companyName ? ` at ${job.companyName}` : ""}\n`;
    }
    content += `\n[View all jobs](/jobs.md)\n`;
  }

  return markdownResponse(content);
}
