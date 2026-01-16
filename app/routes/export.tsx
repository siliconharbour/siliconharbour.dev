import type { Route } from "./+types/export";
import JSZip from "jszip";
import { db } from "~/db";
import { events, eventDates, companies, groups, learning, people, news, jobs, projects } from "~/db/schema";
import { asc, desc } from "drizzle-orm";
import { format } from "date-fns";

const SITE_URL = process.env.SITE_URL || "https://siliconharbour.dev";

export async function loader({}: Route.LoaderArgs) {
  const zip = new JSZip();

  // Fetch all data
  const [
    allEvents,
    allEventDates,
    allCompanies,
    allGroups,
    allLearning,
    allPeople,
    allNews,
    allJobs,
    allProjects,
  ] = await Promise.all([
    db.select().from(events).orderBy(asc(events.title)),
    db.select().from(eventDates),
    db.select().from(companies).orderBy(asc(companies.name)),
    db.select().from(groups).orderBy(asc(groups.name)),
    db.select().from(learning).orderBy(asc(learning.name)),
    db.select().from(people).orderBy(asc(people.name)),
    db.select().from(news).orderBy(desc(news.publishedAt)),
    db.select().from(jobs).orderBy(desc(jobs.postedAt)),
    db.select().from(projects).orderBy(asc(projects.name)),
  ]);

  // Build event dates lookup
  const eventDatesMap = new Map<number, typeof allEventDates>();
  for (const date of allEventDates) {
    if (!eventDatesMap.has(date.eventId)) {
      eventDatesMap.set(date.eventId, []);
    }
    eventDatesMap.get(date.eventId)!.push(date);
  }

  // Export events
  const eventsFolder = zip.folder("events");
  for (const event of allEvents) {
    const dates = eventDatesMap.get(event.id) || [];
    const frontmatter = buildFrontmatter({
      title: event.title,
      slug: event.slug,
      organizer: event.organizer,
      location: event.location,
      link: event.link,
      coverImage: event.coverImage ? `${SITE_URL}/images/${event.coverImage}` : null,
      dates: dates.map(d => ({
        start: d.startDate.toISOString(),
        end: d.endDate?.toISOString() || null,
      })),
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    });
    eventsFolder?.file(`${event.slug}.md`, `${frontmatter}\n${event.description}`);
  }

  // Export companies
  const companiesFolder = zip.folder("companies");
  for (const company of allCompanies) {
    const frontmatter = buildFrontmatter({
      name: company.name,
      slug: company.slug,
      website: company.website,
      location: company.location,
      founded: company.founded,
      logo: company.logo ? `${SITE_URL}/images/${company.logo}` : null,
      coverImage: company.coverImage ? `${SITE_URL}/images/${company.coverImage}` : null,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    });
    companiesFolder?.file(`${company.slug}.md`, `${frontmatter}\n${company.description}`);
  }

  // Export groups
  const groupsFolder = zip.folder("groups");
  for (const group of allGroups) {
    const frontmatter = buildFrontmatter({
      name: group.name,
      slug: group.slug,
      website: group.website,
      meetingFrequency: group.meetingFrequency,
      logo: group.logo ? `${SITE_URL}/images/${group.logo}` : null,
      coverImage: group.coverImage ? `${SITE_URL}/images/${group.coverImage}` : null,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    });
    groupsFolder?.file(`${group.slug}.md`, `${frontmatter}\n${group.description}`);
  }

  // Export learning
  const learningFolder = zip.folder("learning");
  for (const inst of allLearning) {
    const frontmatter = buildFrontmatter({
      name: inst.name,
      slug: inst.slug,
      type: inst.type,
      website: inst.website,
      logo: inst.logo ? `${SITE_URL}/images/${inst.logo}` : null,
      coverImage: inst.coverImage ? `${SITE_URL}/images/${inst.coverImage}` : null,
      createdAt: inst.createdAt.toISOString(),
      updatedAt: inst.updatedAt.toISOString(),
    });
    learningFolder?.file(`${inst.slug}.md`, `${frontmatter}\n${inst.description}`);
  }

  // Export people
  const peopleFolder = zip.folder("people");
  for (const person of allPeople) {
    const frontmatter = buildFrontmatter({
      name: person.name,
      slug: person.slug,
      website: person.website,
      avatar: person.avatar ? `${SITE_URL}/images/${person.avatar}` : null,
      socialLinks: person.socialLinks ? JSON.parse(person.socialLinks) : null,
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
    });
    peopleFolder?.file(`${person.slug}.md`, `${frontmatter}\n${person.bio}`);
  }

  // Export news
  const newsFolder = zip.folder("news");
  for (const article of allNews) {
    const frontmatter = buildFrontmatter({
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      coverImage: article.coverImage ? `${SITE_URL}/images/${article.coverImage}` : null,
      publishedAt: article.publishedAt?.toISOString() || null,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
    });
    newsFolder?.file(`${article.slug}.md`, `${frontmatter}\n${article.content}`);
  }

  // Export jobs
  const jobsFolder = zip.folder("jobs");
  for (const job of allJobs) {
    const frontmatter = buildFrontmatter({
      title: job.title,
      slug: job.slug,
      companyName: job.companyName,
      location: job.location,
      remote: job.remote,
      salaryRange: job.salaryRange,
      applyLink: job.applyLink,
      postedAt: job.postedAt.toISOString(),
      expiresAt: job.expiresAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
    jobsFolder?.file(`${job.slug}.md`, `${frontmatter}\n${job.description}`);
  }

  // Export projects
  const projectsFolder = zip.folder("projects");
  for (const project of allProjects) {
    const frontmatter = buildFrontmatter({
      name: project.name,
      slug: project.slug,
      type: project.type,
      status: project.status,
      links: project.links ? JSON.parse(project.links) : null,
      logo: project.logo ? `${SITE_URL}/images/${project.logo}` : null,
      coverImage: project.coverImage ? `${SITE_URL}/images/${project.coverImage}` : null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    });
    projectsFolder?.file(`${project.slug}.md`, `${frontmatter}\n${project.description}`);
  }

  // Generate zip
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const filename = `siliconharbour-export-${format(new Date(), "yyyy-MM-dd")}.zip`;

  return new Response(zipBlob, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function buildFrontmatter(data: Record<string, unknown>): string {
  const lines = ["---"];
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    
    if (typeof value === "string") {
      // Escape strings that might break YAML
      if (value.includes(":") || value.includes("#") || value.includes("'") || value.includes('"') || value.includes("\n")) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          const objEntries = Object.entries(item);
          if (objEntries.length > 0) {
            lines.push(`  - ${objEntries[0][0]}: ${objEntries[0][1]}`);
            for (let i = 1; i < objEntries.length; i++) {
              const [k, v] = objEntries[i];
              if (v !== null) {
                lines.push(`    ${k}: ${v}`);
              }
            }
          }
        } else {
          lines.push(`  - ${item}`);
        }
      }
    } else if (typeof value === "object") {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v !== null && v !== undefined) {
          lines.push(`  ${k}: ${v}`);
        }
      }
    }
  }
  
  lines.push("---");
  return lines.join("\n");
}
