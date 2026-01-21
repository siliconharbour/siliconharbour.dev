import type { Route } from "./+types/products.$slug";
import { useLoaderData, Link } from "react-router";
import { getProductBySlugWithCompany } from "~/lib/products.server";
import { prepareRefsForClient, getDetailedBacklinks } from "~/lib/references.server";
import { getPublicComments, getAllComments } from "~/lib/comments.server";
import { getTurnstileSiteKey } from "~/lib/turnstile.server";
import { getOptionalUser } from "~/lib/session.server";
import { areCommentsEnabled } from "~/lib/config.server";
import { RichMarkdown } from "~/components/RichMarkdown";
import { CommentSection } from "~/components/CommentSection";
import { ReferencedBy } from "~/components/ReferencedBy";
import type { ProductType } from "~/db/schema";

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: `${data?.product?.name ?? "Product"} - siliconharbour.dev` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const product = await getProductBySlugWithCompany(params.slug);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }
  
  const user = await getOptionalUser(request);
  const isAdmin = user?.user.role === "admin";
  
  const [resolvedRefs, backlinks, comments, commentsEnabled] = await Promise.all([
    prepareRefsForClient(product.description),
    getDetailedBacklinks("product", product.id),
    isAdmin ? getAllComments("product", product.id) : getPublicComments("product", product.id),
    areCommentsEnabled("products"),
  ]);
  
  const turnstileSiteKey = getTurnstileSiteKey();
  
  return { product, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin, commentsEnabled };
}

const typeLabels: Record<ProductType, string> = {
  saas: "SaaS",
  mobile: "Mobile App",
  physical: "Physical Product",
  service: "Service",
  other: "Product",
};

const typeColors: Record<ProductType, string> = {
  saas: "bg-blue-100 text-blue-700",
  mobile: "bg-purple-100 text-purple-700",
  physical: "bg-amber-100 text-amber-700",
  service: "bg-green-100 text-green-700",
  other: "bg-harbour-100 text-harbour-500",
};

export default function ProductDetail() {
  const { product, resolvedRefs, backlinks, comments, turnstileSiteKey, isAdmin, commentsEnabled } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="flex flex-col gap-6">
        {product.coverImage && (
          <div className="aspect-video relative overflow-hidden bg-harbour-100">
            <img
              src={`/images/${product.coverImage}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start gap-4">
          {product.logo && (
            <div className="w-20 h-20 relative overflow-hidden bg-harbour-100 flex-shrink-0">
              <img
                src={`/images/${product.logo}`}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          )}
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-harbour-700">{product.name}</h1>
              {isAdmin && (
                <Link
                  to={`/manage/products/${product.id}`}
                  className="p-1.5 text-harbour-400 hover:text-harbour-600 hover:bg-harbour-100 transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-1.5 py-0.5 ${typeColors[product.type]}`}>
                {typeLabels[product.type]}
              </span>
              {product.company && (
                <Link 
                  to={`/directory/companies/${product.company.slug}`}
                  className="text-sm text-harbour-500 hover:text-harbour-700"
                >
                  by {product.company.name}
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="prose">
          <RichMarkdown content={product.description} resolvedRefs={resolvedRefs} />
        </div>

        {/* Links */}
        {product.website && (
          <div className="flex flex-wrap gap-2">
            <a
              href={product.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-harbour-100 text-harbour-700 hover:bg-harbour-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Website
            </a>
          </div>
        )}

        <ReferencedBy backlinks={backlinks} />

        {commentsEnabled && (
          <CommentSection
            contentType="product"
            contentId={product.id}
            comments={comments}
            turnstileSiteKey={turnstileSiteKey}
            isAdmin={isAdmin}
          />
        )}
      </article>
    </div>
  );
}
