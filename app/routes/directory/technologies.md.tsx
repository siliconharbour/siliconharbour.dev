import type { Route } from "./+types/technologies.md";
import { getTechnologiesWithUsage } from "~/lib/technologies.server";
import { markdownResponse } from "~/lib/markdown.server";
import { categoryLabels, technologyCategories } from "~/lib/technology-categories";

const SITE_URL = process.env.SITE_URL || "https://siliconharbour.dev";

export async function loader({}: Route.LoaderArgs) {
  const technologies = await getTechnologiesWithUsage();

  // Group by category
  const byCategory: Record<string, typeof technologies> = {};
  for (const tech of technologies) {
    if (!byCategory[tech.category]) {
      byCategory[tech.category] = [];
    }
    byCategory[tech.category].push(tech);
  }

  // Sort each category by company count
  for (const category of Object.keys(byCategory)) {
    byCategory[category].sort((a, b) => b.companyCount - a.companyCount);
  }

  const total = technologies.length;

  let content = `---
type: technology_list
url: ${SITE_URL}/directory/technologies
api_url: ${SITE_URL}/api/technologies
total: ${total}
---

# Technologies

Technologies used by companies in the local tech ecosystem.

**Total:** ${total} technologies across ${technologyCategories.length} categories

`;

  for (const category of technologyCategories) {
    const techs = byCategory[category];
    if (!techs || techs.length === 0) continue;

    content += `## ${categoryLabels[category]}\n\n`;

    for (const tech of techs) {
      content += `- [${tech.name}](${SITE_URL}/directory/technologies/${tech.slug}.md) (${tech.companyCount} ${tech.companyCount === 1 ? "company" : "companies"})\n`;
    }

    content += "\n";
  }

  return markdownResponse(content);
}
