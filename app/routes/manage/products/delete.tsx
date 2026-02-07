import type { Route } from "./+types/delete";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getProductById, deleteProduct } from "~/lib/products.server";
import { deleteImage } from "~/lib/images.server";
import { parseIdOrThrow } from "~/lib/admin/route";
import { DeleteConfirmationCard } from "~/components/manage/DeleteConfirmationCard";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Delete ${data?.product?.name || "Product"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "product");

  const product = await getProductById(id);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  return { product };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "product");

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
    <DeleteConfirmationCard
      title="Delete Product"
      message={
        <>
          Are you sure you want to delete <strong>{product.name}</strong>? This action cannot be
          undone.
        </>
      }
    >
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
    </DeleteConfirmationCard>
  );
}
