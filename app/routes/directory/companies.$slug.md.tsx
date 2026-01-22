import type { Route } from "./+types/companies.$slug.md";
import { getCompanyBySlug } from "~/lib/companies.server";
import { markdownResponse, companyToMarkdown } from "~/lib/markdown.server";

export async function loader({ params }: Route.LoaderArgs) {
  const company = await getCompanyBySlug(params.slug);
  if (!company) {
    throw new Response("Company not found", { status: 404 });
  }

  return markdownResponse(companyToMarkdown(company));
}
