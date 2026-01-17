import type { Route } from "./+types/index";
import { useLoaderData, Link } from "react-router";
import { getPaginatedProducts } from "~/lib/products.server";
import { Pagination, parsePaginationParams } from "~/components/Pagination";
import { SearchInput } from "~/components/SearchInput";
import type { ProductType } from "~/db/schema";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Products - siliconharbour.dev" },
    { name: "description", content: "Products from St. John's tech companies" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { limit, offset } = parsePaginationParams(url);
  const searchQuery = url.searchParams.get("q") || "";
  
  const { items: products, total } = await getPaginatedProducts(limit, offset, searchQuery);
  
  return { products, total, limit, offset, searchQuery };
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

export default function ProductsIndex() {
  const { products, total, limit, offset, searchQuery } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-harbour-700">Products</h1>
            <p className="text-harbour-500">Products and services from St. John's tech companies</p>
          </div>
          
          {/* Search - only show if pagination is needed */}
          {(total > limit || searchQuery) && (
            <>
              <SearchInput placeholder="Search products..." />
              
              {/* Result count */}
              {searchQuery && (
                <p className="text-sm text-harbour-500">
                  {total} result{total !== 1 ? "s" : ""} for "{searchQuery}"
                </p>
              )}
            </>
          )}
        </div>

        {products.length === 0 ? (
          <p className="text-harbour-400">
            {searchQuery ? "No products match your search." : "No products listed yet."}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <a
                key={product.id}
                href={`/products/${product.slug}`}
                className="group flex flex-col ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all overflow-hidden"
              >
                {product.coverImage ? (
                  <div className="img-tint aspect-video relative overflow-hidden bg-harbour-100">
                    <img
                      src={`/images/${product.coverImage}`}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                ) : product.logo ? (
                  <div className="aspect-video relative overflow-hidden bg-harbour-50 flex items-center justify-center">
                    <div className="w-20 h-20 relative overflow-hidden">
                      <img
                        src={`/images/${product.logo}`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-harbour-100 flex items-center justify-center">
                    <span className="text-4xl font-bold text-harbour-300">
                      {product.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                
                <div className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
                      {product.name}
                    </h2>
                    <span className={`text-xs px-1.5 py-0.5 ${typeColors[product.type]}`}>
                      {typeLabels[product.type]}
                    </span>
                  </div>
                  
                  {product.company && (
                    <p className="text-xs text-harbour-400">
                      by {product.company.name}
                    </p>
                  )}
                  
                  {/* Quick link icon */}
                  {product.website && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-harbour-400" title="Website">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                      </span>
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
        
        <Pagination total={total} limit={limit} offset={offset} />
      </div>
    </div>
  );
}
