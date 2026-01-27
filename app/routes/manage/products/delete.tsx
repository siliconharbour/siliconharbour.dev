import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getProductById, deleteProduct } from "~/lib/products.server";
import { deleteImage } from "~/lib/images.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.product?.name || "Product"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid product ID", { status: 400 });
  }

  const product = await getProductById(id);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  return { product };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid product ID", { status: 400 });
  }

  const product = await getProductById(id);
  if (product) {
    // Delete associated images
    if (product.logo) {
      await deleteImage(product.logo);
    }
    if (product.coverImage) {
      await deleteImage(product.coverImage);
    }
  }

  await deleteProduct(id);
  return redirect("/manage/products");
}

export default function DeleteProduct() {
  const { product } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-harbour-200 p-6 flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-harbour-700">Delete Product</h1>

        <p className="text-harbour-500">
          Are you sure you want to delete <strong>{product.name}</strong>? This action cannot be
          undone.
        </p>

        <Form method="post" className="flex gap-4">
          <button
            type="submit"
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
          >
            Delete
          </button>
          <Link
            to="/manage/products"
            className="px-4 py-2 text-harbour-600 hover:bg-harbour-50 font-medium transition-colors"
          >
            Cancel
          </Link>
        </Form>
      </div>
    </div>
  );
}
