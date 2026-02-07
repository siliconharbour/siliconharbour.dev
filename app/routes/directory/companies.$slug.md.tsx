import type { Route } from "./+types/companies.$slug.md";
import { getCompanyBySlug } from "~/lib/companies.server";
import { getTechnologiesForContent } from "~/lib/technologies.server";
import { markdownResponse, companyToMarkdown } from "~/lib/markdown.server";
import { categoryLabels } from "~/lib/technology-categories";

export async function loader({ params }: Route.LoaderArgs) {
  const company = await getCompanyBySlug(params.slug);
  if (!company) {
    throw new Response("Company not found", { status: 404 });
  }

  const technologiesWithAssignments = await getTechnologiesForContent("company", company.id);

  const technologies = technologiesWithAssignments.map((t) => ({
    name: t.technology.name,
    slug: t.technology.slug,
    category: categoryLabels[t.technology.category],
  }));

  const firstEvidence = technologiesWithAssignments.flatMap((assignment) => assignment.evidence)[0] ?? null;
  const provenance = firstEvidence
    ? {
        source: firstEvidence.sourceLabel,
        sourceUrl: firstEvidence.sourceUrl,
        lastVerified: firstEvidence.lastVerified,
      }
    : null;

  return markdownResponse(companyToMarkdown(company, technologies, provenance));
}
