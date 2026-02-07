import type { Route } from "./+types/index";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getPaginatedProducts } from "~/lib/products.server";
import { SearchInput } from "~/components/SearchInput";
import type { ProductType } from "~/db/schema";
import { ManagePage } from "~/components/manage/ManagePage";
import { ManageList, ManageListActions, ManageListEmpty, ManageListItem } from "~/components/manage/ManageList";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage Products - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q") || "";
  const { items: products } = await getPaginatedProducts(100, 0, searchQuery);
  return { products, searchQuery };
}

const typeLabels: Record<ProductType, string> = {
  saas: "SaaS",
  mobile: "Mobile App",
  physical: "Physical Product",
  service: "Service",
  other: "Other",
};

const typeColors: Record<ProductType, string> = {
  saas: "bg-blue-100 text-blue-700",
  mobile: "bg-purple-100 text-purple-700",
  physical: "bg-amber-100 text-amber-700",
  service: "bg-green-100 text-green-700",
  other: "bg-harbour-100 text-harbour-500",
};

export default function ManageProductsIndex() {
  const { products } = useLoaderData<typeof loader>();

  return (
    <ManagePage
      title="Products"
      actions={
        <Link
          to="/manage/products/new"
          className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
        >
          New Product
        </Link>
      }
    >
      <SearchInput placeholder="Search products..." />

      {products.length === 0 ? (
        <ManageListEmpty>No products yet. Create your first product to get started.</ManageListEmpty>
      ) : (
        <ManageList>
          {products.map((product) => (
            <ManageListItem key={product.id}>
              {product.logo ? (
                <img src={`/images/${product.logo}`} alt="" className="w-12 h-12 object-contain" />
              ) : product.coverImage ? (
                <img src={`/images/${product.coverImage}`} alt="" className="w-12 h-12 object-cover" />
              ) : (
                <div className="w-12 h-12 bg-harbour-100 flex items-center justify-center">
                  <span className="text-lg font-bold text-harbour-300">
                    {product.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium truncate text-harbour-700">{product.name}</h2>
                  <span className={`text-xs px-1.5 py-0.5 ${typeColors[product.type]}`}>
                    {typeLabels[product.type]}
                  </span>
                </div>
                {product.company && <p className="text-sm text-harbour-400">by {product.company.name}</p>}
              </div>

              <ManageListActions>
                <Link
                  to={`/manage/products/${product.id}`}
                  className="px-3 py-1.5 text-sm font-medium text-harbour-600 hover:bg-harbour-50 transition-colors"
                >
                  Edit
                </Link>
                <Link
                  to={`/manage/products/${product.id}/delete`}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete
                </Link>
              </ManageListActions>
            </ManageListItem>
          ))}
        </ManageList>
      )}
    </ManagePage>
  );
}
