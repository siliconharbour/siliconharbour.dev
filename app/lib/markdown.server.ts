/**
 * Markdown export utilities for LLM-friendly content delivery
 * Each function generates markdown with YAML frontmatter for a given entity
 */

import type { Company, Group, Education, Person, News, Job, Project, Product } from "~/db/schema";
import type { EventWithDates } from "~/lib/events.server";

const SITE_URL = process.env.SITE_URL || "https://siliconharbour.dev";

// =============================================================================
// Response helpers
// =============================================================================

export function markdownResponse(content: string): Response {
  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// =============================================================================
// YAML frontmatter helper
// =============================================================================

function formatFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string") {
      // Escape quotes and handle multiline
      if (value.includes("\n") || value.includes('"') || value.includes(":")) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else if (value instanceof Date) {
      lines.push(`${key}: ${value.toISOString()}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else if (typeof value === "object") {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) {
        if (v !== null && v !== undefined) {
          lines.push(`  ${k}: ${v}`);
        }
      }
    }
  }

  lines.push("---");
  return lines.join("\n");
}

// =============================================================================
// Entity to Markdown converters
// =============================================================================

export interface CompanyTechnology {
  name: string;
  slug: string;
  category: string;
}

export interface CompanyTechProvenance {
  source: string | null;
  sourceUrl: string | null;
  lastVerified: string | null;
}

export function companyToMarkdown(
  company: Company,
  technologies?: CompanyTechnology[],
  provenance?: CompanyTechProvenance | null,
): string {
  const frontmatter = formatFrontmatter({
    type: "company",
    id: company.id,
    slug: company.slug,
    name: company.name,
    url: `${SITE_URL}/directory/companies/${company.slug}`,
    api_url: `${SITE_URL}/api/companies/${company.slug}`,
    website: company.website,
    wikipedia: company.wikipedia,
    github: company.github,
    location: company.location,
    founded: company.founded,
    logo: company.logo ? `${SITE_URL}/images/${company.logo}` : null,
    technologies: technologies?.map((t) => t.name),
    updated_at: company.updatedAt,
  });

  let content = `${frontmatter}

# ${company.name}

${company.description}
`;

  if (technologies && technologies.length > 0) {
    content += `\n## Technologies\n\n`;

    // Group by category
    const byCategory = new Map<string, CompanyTechnology[]>();
    for (const tech of technologies) {
      if (!byCategory.has(tech.category)) {
        byCategory.set(tech.category, []);
      }
      byCategory.get(tech.category)!.push(tech);
    }

    for (const [category, techs] of byCategory) {
      content += `**${category}:** ${techs.map((t) => `[${t.name}](${SITE_URL}/directory/technologies/${t.slug}.md)`).join(", ")}\n\n`;
    }

    if (provenance && (provenance.source || provenance.sourceUrl)) {
      content += `*Source: ${provenance.sourceUrl ? `[${provenance.source || "link"}](${provenance.sourceUrl})` : provenance.source}`;
      if (provenance.lastVerified) {
        const date = new Date(provenance.lastVerified);
        content += ` (${date.toLocaleDateString("en-US", { month: "short", year: "numeric" })})`;
      }
      content += `*\n`;
    }
  }

  return content;
}

export function eventToMarkdown(event: EventWithDates): string {
  const dates = event.dates.map((d) => ({
    start: d.startDate.toISOString(),
    end: d.endDate?.toISOString(),
  }));

  const frontmatter = formatFrontmatter({
    type: "event",
    id: event.id,
    slug: event.slug,
    title: event.title,
    url: `${SITE_URL}/events/${event.slug}`,
    api_url: `${SITE_URL}/api/events/${event.slug}`,
    link: event.link,
    location: event.location,
    organizer: event.organizer,
    requires_signup: event.requiresSignup,
    recurring: !!event.recurrenceRule,
    updated_at: event.updatedAt,
  });

  let datesSection = "";
  if (dates.length > 0) {
    datesSection = "\n## Dates\n\n";
    for (const d of dates) {
      datesSection += `- ${d.start}${d.end ? ` to ${d.end}` : ""}\n`;
    }
  }

  return `${frontmatter}

# ${event.title}

${event.organizer ? `**Organizer:** ${event.organizer}\n\n` : ""}${event.location ? `**Location:** ${event.location}\n\n` : ""}**Event Link:** ${event.link}
${datesSection}
## Description

${event.description}
`;
}

export function groupToMarkdown(group: Group): string {
  const frontmatter = formatFrontmatter({
    type: "group",
    id: group.id,
    slug: group.slug,
    name: group.name,
    url: `${SITE_URL}/directory/groups/${group.slug}`,
    api_url: `${SITE_URL}/api/groups/${group.slug}`,
    website: group.website,
    meeting_frequency: group.meetingFrequency,
    logo: group.logo ? `${SITE_URL}/images/${group.logo}` : null,
    updated_at: group.updatedAt,
  });

  return `${frontmatter}

# ${group.name}

${group.meetingFrequency ? `**Meets:** ${group.meetingFrequency}\n\n` : ""}${group.website ? `**Website:** ${group.website}\n\n` : ""}${group.description}
`;
}

export function educationToMarkdown(edu: Education): string {
  const frontmatter = formatFrontmatter({
    type: "education",
    id: edu.id,
    slug: edu.slug,
    name: edu.name,
    url: `${SITE_URL}/directory/education/${edu.slug}`,
    api_url: `${SITE_URL}/api/education/${edu.slug}`,
    website: edu.website,
    education_type: edu.type,
    logo: edu.logo ? `${SITE_URL}/images/${edu.logo}` : null,
    updated_at: edu.updatedAt,
  });

  return `${frontmatter}

# ${edu.name}

**Type:** ${edu.type}

${edu.website ? `**Website:** ${edu.website}\n\n` : ""}${edu.description}
`;
}

export function personToMarkdown(person: Person): string {
  let socialLinks: Record<string, string> = {};
  if (person.socialLinks) {
    try {
      socialLinks = JSON.parse(person.socialLinks);
    } catch {}
  }

  const frontmatter = formatFrontmatter({
    type: "person",
    id: person.id,
    slug: person.slug,
    name: person.name,
    url: `${SITE_URL}/directory/people/${person.slug}`,
    api_url: `${SITE_URL}/api/people/${person.slug}`,
    website: person.website,
    github: person.github,
    avatar: person.avatar ? `${SITE_URL}/images/${person.avatar}` : null,
    social_links: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
    updated_at: person.updatedAt,
  });

  return `${frontmatter}

# ${person.name}

${person.bio}
`;
}

export function newsToMarkdown(article: News): string {
  const frontmatter = formatFrontmatter({
    type: "news",
    id: article.id,
    slug: article.slug,
    title: article.title,
    url: `${SITE_URL}/news/${article.slug}`,
    api_url: `${SITE_URL}/api/news/${article.slug}`,
    news_type: article.type,
    excerpt: article.excerpt,
    published_at: article.publishedAt,
    updated_at: article.updatedAt,
  });

  return `${frontmatter}

# ${article.title}

${article.excerpt ? `> ${article.excerpt}\n\n` : ""}${article.content}
`;
}

export function jobToMarkdown(job: Job & { companyName?: string | null }): string {
  const description = job.description || job.descriptionText || "";
  const isRemote = job.workplaceType === "remote";
  
  const frontmatter = formatFrontmatter({
    type: "job",
    id: job.id,
    slug: job.slug,
    title: job.title,
    url: job.slug ? `${SITE_URL}/jobs/${job.slug}` : job.url,
    api_url: job.slug ? `${SITE_URL}/api/jobs/${job.slug}` : null,
    company_name: job.companyName,
    location: job.location,
    department: job.department,
    workplace_type: job.workplaceType,
    salary_range: job.salaryRange,
    apply_url: job.url,
    posted_at: job.postedAt,
    updated_at: job.updatedAt,
  });

  return `${frontmatter}

# ${job.title}

${job.companyName ? `**Company:** ${job.companyName}\n\n` : ""}${job.location ? `**Location:** ${job.location}${isRemote ? " (Remote)" : ""}\n\n` : isRemote ? "**Remote:** Yes\n\n" : ""}${job.department ? `**Department:** ${job.department}\n\n` : ""}${job.salaryRange ? `**Salary:** ${job.salaryRange}\n\n` : ""}${job.url ? `**Apply:** ${job.url}` : ""}

## Description

${description}
`;
}

export function projectToMarkdown(project: Project): string {
  let links: Record<string, string> = {};
  if (project.links) {
    try {
      links = JSON.parse(project.links);
    } catch {}
  }

  const frontmatter = formatFrontmatter({
    type: "project",
    id: project.id,
    slug: project.slug,
    name: project.name,
    url: `${SITE_URL}/directory/projects/${project.slug}`,
    api_url: `${SITE_URL}/api/projects/${project.slug}`,
    project_type: project.type,
    status: project.status,
    logo: project.logo ? `${SITE_URL}/images/${project.logo}` : null,
    links: Object.keys(links).length > 0 ? links : undefined,
    updated_at: project.updatedAt,
  });

  let linksSection = "";
  if (Object.keys(links).length > 0) {
    linksSection = "\n## Links\n\n";
    for (const [name, url] of Object.entries(links)) {
      linksSection += `- **${name}:** ${url}\n`;
    }
  }

  return `${frontmatter}

# ${project.name}

**Type:** ${project.type} | **Status:** ${project.status}
${linksSection}
## Description

${project.description}
`;
}

export function productToMarkdown(product: Product, companyName?: string): string {
  const frontmatter = formatFrontmatter({
    type: "product",
    id: product.id,
    slug: product.slug,
    name: product.name,
    url: `${SITE_URL}/directory/products/${product.slug}`,
    api_url: `${SITE_URL}/api/products/${product.slug}`,
    website: product.website,
    product_type: product.type,
    company_id: product.companyId,
    logo: product.logo ? `${SITE_URL}/images/${product.logo}` : null,
    updated_at: product.updatedAt,
  });

  return `${frontmatter}

# ${product.name}

**Type:** ${product.type}

${companyName ? `**Company:** ${companyName}\n\n` : ""}${product.website ? `**Website:** ${product.website}\n\n` : ""}${product.description}
`;
}

// =============================================================================
// List page markdown generators
// =============================================================================

interface ListPageOptions {
  title: string;
  description: string;
  items: { slug: string; name: string; description?: string }[];
  entityType: string;
  basePath: string;
  total: number;
  limit: number;
  offset: number;
  searchQuery?: string;
}

export function listPageToMarkdown(opts: ListPageOptions): string {
  const { title, description, items, entityType, basePath, total, limit, offset, searchQuery } =
    opts;

  const frontmatter = formatFrontmatter({
    type: `${entityType}_list`,
    url: `${SITE_URL}${basePath}`,
    api_url: `${SITE_URL}/api/${entityType}`,
    total,
    limit,
    offset,
    has_more: offset + limit < total,
    search_query: searchQuery || undefined,
  });

  let content = `${frontmatter}

# ${title}

${description}

**Total:** ${total} ${entityType}${total !== 1 ? "s" : ""}
${searchQuery ? `**Search:** "${searchQuery}"\n` : ""}
## ${title}

`;

  if (items.length === 0) {
    content += `No ${entityType}s found.\n`;
  } else {
    for (const item of items) {
      content += `- [${item.name}](${SITE_URL}${basePath}/${item.slug}.md)${item.description ? `: ${item.description.slice(0, 100)}${item.description.length > 100 ? "..." : ""}` : ""}\n`;
    }
  }

  if (total > offset + limit) {
    content += `\n*Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total}. Use \`?limit=N&offset=N\` to paginate.*\n`;
  }

  return content;
}
