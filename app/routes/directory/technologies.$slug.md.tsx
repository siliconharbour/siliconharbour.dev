import type { Route } from "./+types/technologies.$slug.md";
import {
  getTechnologyBySlug,
  getCompaniesUsingTechnology,
  getProjectsUsingTechnology,
} from "~/lib/technologies.server";
import { markdownResponse } from "~/lib/markdown.server";
import { categoryLabels } from "~/lib/technology-categories";

const SITE_URL = process.env.SITE_URL || "https://siliconharbour.dev";

export async function loader({ params }: Route.LoaderArgs) {
  const technology = await getTechnologyBySlug(params.slug);
  if (!technology) {
    throw new Response("Technology not found", { status: 404 });
  }

  const [companies, projects] = await Promise.all([
    getCompaniesUsingTechnology(technology.id),
    getProjectsUsingTechnology(technology.id),
  ]);

  let content = `---
type: technology
id: ${technology.id}
slug: ${technology.slug}
name: ${technology.name}
url: ${SITE_URL}/directory/technologies/${technology.slug}
api_url: ${SITE_URL}/api/technologies/${technology.slug}
category: ${technology.category}
category_label: ${categoryLabels[technology.category]}
${technology.website ? `website: ${technology.website}` : ""}
${technology.description ? `description: "${technology.description.replace(/"/g, '\\"')}"` : ""}
company_count: ${companies.length}
project_count: ${projects.length}
---

# ${technology.name}

**Category:** ${categoryLabels[technology.category]}

${technology.website ? `**Website:** ${technology.website}\n\n` : ""}${technology.description ? `${technology.description}\n\n` : ""}`;

  if (companies.length > 0) {
    content += `## Companies using ${technology.name}\n\n`;
    for (const company of companies) {
      content += `- [${company.name}](${SITE_URL}/directory/companies/${company.slug}.md)\n`;
    }
    content += "\n";
  }

  if (projects.length > 0) {
    content += `## Projects using ${technology.name}\n\n`;
    for (const project of projects) {
      content += `- [${project.name}](${SITE_URL}/directory/projects/${project.slug}.md)\n`;
    }
    content += "\n";
  }

  if (companies.length === 0 && projects.length === 0) {
    content += `No companies or projects are currently using ${technology.name}.\n`;
  }

  return markdownResponse(content);
}
