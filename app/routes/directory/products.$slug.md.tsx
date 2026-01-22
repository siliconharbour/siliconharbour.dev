import type { Route } from "./+types/products.$slug.md";
import { getProductBySlug } from "~/lib/products.server";
import { getCompanyById } from "~/lib/companies.server";
import { markdownResponse, productToMarkdown } from "~/lib/markdown.server";

export async function loader({ params }: Route.LoaderArgs) {
  const product = await getProductBySlug(params.slug);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  let companyName: string | undefined;
  if (product.companyId) {
    const company = await getCompanyById(product.companyId);
    companyName = company?.name;
  }

  return markdownResponse(productToMarkdown(product, companyName));
}
