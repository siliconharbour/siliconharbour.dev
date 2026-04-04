import { db } from "~/db";
import {
  companies,
  groups,
  people,
  events,
  news,
  jobs,
  education,
  technologies,
  products,
  projects,
} from "~/db/schema";
import { eq, isNull, or, ne, isNotNull } from "drizzle-orm";


export interface SitemapEntry {
  url: string;
  lastmod?: string;
  section: string;
  label: string;
}

const STATIC_PAGES: Omit<SitemapEntry, "lastmod">[] = [
  { url: "/", section: "Core", label: "Home" },
  { url: "/about", section: "Core", label: "About" },
  { url: "/api", section: "Core", label: "API Docs" },
  { url: "/conduct", section: "Core", label: "Code of Conduct" },
  { url: "/stay-connected", section: "Core", label: "Stay Connected" },
  { url: "/directory", section: "Directory", label: "Directory" },
  { url: "/directory/companies", section: "Directory", label: "Companies" },
  { url: "/directory/groups", section: "Directory", label: "Groups" },
  { url: "/directory/people", section: "Directory", label: "People" },
  { url: "/directory/products", section: "Directory", label: "Products" },
  { url: "/directory/projects", section: "Directory", label: "Projects" },
  { url: "/directory/education", section: "Directory", label: "Education" },
  { url: "/directory/technologies", section: "Directory", label: "Technologies" },
  { url: "/events", section: "Content", label: "Events" },
  { url: "/news", section: "Content", label: "News" },
  { url: "/jobs", section: "Content", label: "Jobs" },
];

function toISODate(date: Date | null | undefined): string | undefined {
  if (!date) return undefined;
  return date.toISOString().split("T")[0];
}

export async function getSitemapEntries(siteUrl: string): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = STATIC_PAGES.map((p) => ({
    ...p,
    url: `${siteUrl}${p.url}`,
  }));

  const [
    allCompanies,
    allGroups,
    allPeople,
    allEducation,
    allTechnologies,
    allProducts,
    allProjects,
    publishedNews,
    publishedEvents,
    activeJobs,
  ] = await Promise.all([
    db.select({ slug: companies.slug, updatedAt: companies.updatedAt }).from(companies).where(eq(companies.visible, true)),
    db.select({ slug: groups.slug, updatedAt: groups.updatedAt }).from(groups).where(eq(groups.visible, true)),
    db.select({ slug: people.slug, updatedAt: people.updatedAt }).from(people).where(eq(people.visible, true)),
    db.select({ slug: education.slug, updatedAt: education.updatedAt }).from(education).where(eq(education.visible, true)),
    db.select({ slug: technologies.slug, updatedAt: technologies.updatedAt }).from(technologies).where(eq(technologies.visible, true)),
    db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products),
    db.select({ slug: projects.slug, updatedAt: projects.updatedAt }).from(projects).where(ne(projects.status, "archived")),
    db.select({ slug: news.slug, updatedAt: news.updatedAt }).from(news).where(isNotNull(news.publishedAt)),
    db.select({ slug: events.slug, updatedAt: events.updatedAt }).from(events).where(or(isNull(events.importStatus), eq(events.importStatus, "published"))),
    db.select({ slug: jobs.slug, updatedAt: jobs.updatedAt }).from(jobs).where(eq(jobs.status, "active")),
  ]);

  const push = (rows: { slug: string; updatedAt: Date | null }[], path: string, section: string, labelFn: (s: string) => string) => {
    for (const row of rows) {
      if (!row.slug) continue;
      entries.push({
        url: `${siteUrl}/${path}/${row.slug}`,
        lastmod: toISODate(row.updatedAt),
        section,
        label: labelFn(row.slug),
      });
    }
  };

  push(allCompanies, "directory/companies", "Companies", (s) => s);
  push(allGroups, "directory/groups", "Groups", (s) => s);
  push(allPeople, "directory/people", "People", (s) => s);
  push(allEducation, "directory/education", "Education", (s) => s);
  push(allTechnologies, "directory/technologies", "Technologies", (s) => s);
  push(allProducts, "directory/products", "Products", (s) => s);
  push(allProjects, "directory/projects", "Projects", (s) => s);
  push(publishedNews, "news", "News", (s) => s);
  push(publishedEvents, "events", "Events", (s) => s);
  push(activeJobs as { slug: string; updatedAt: Date | null }[], "jobs", "Jobs", (s) => s);

  return entries;
}
