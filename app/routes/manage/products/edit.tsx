import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/session.server";
import { getProductById, updateProduct } from "~/lib/products.server";
import { getAllCompanies } from "~/lib/companies.server";
import {
  processAndSaveCoverImage,
  processAndSaveIconImageWithPadding,
} from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { productTypes } from "~/db/schema";
import { parseIdOrError, parseIdOrThrow } from "~/lib/admin/route";
import { parseFormData, zOptionalNullableString, zRequiredString } from "~/lib/admin/form";
import { actionError } from "~/lib/admin/action-result";
import { resolveUpdatedImage } from "~/lib/admin/image-fields";
import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.product?.name || "Product"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseIdOrThrow(params.id, "product");

  const product = await getProductById(id);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  const companies = await getAllCompanies();

  return { product, companies };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const parsedId = parseIdOrError(params.id, "product");
  if ("error" in parsedId) return parsedId;
  const id = parsedId.id;

  const existingProduct = await getProductById(id);
  if (!existingProduct) {
    return actionError("Product not found");
  }

  const formData = await request.formData();
  const schema = z.object({
    name: zRequiredString("Name"),
    description: zRequiredString("Description"),
    website: zOptionalNullableString,
    type: z.enum(productTypes),
    companyId: zOptionalNullableString,
  });
  const parsed = parseFormData(formData, schema);
  if (!parsed.success) {
    return actionError(parsed.error);
  }

  const logo = await resolveUpdatedImage({
    formData,
    uploadedImageField: "logoData",
    existingImageField: "existingLogo",
    currentImage: existingProduct.logo,
    processor: processAndSaveIconImageWithPadding,
  });

  const coverImage = await resolveUpdatedImage({
    formData,
    uploadedImageField: "coverImageData",
    existingImageField: "existingCoverImage",
    currentImage: existingProduct.coverImage,
    processor: processAndSaveCoverImage,
  });

  await updateProduct(id, {
    name: parsed.data.name,
    description: parsed.data.description,
    website: parsed.data.website,
    type: parsed.data.type,
    companyId: parsed.data.companyId ? Number.parseInt(parsed.data.companyId, 10) : null,
    ...(logo !== undefined && { logo }),
    ...(coverImage !== undefined && { coverImage }),
  });

  return redirect("/manage/products");
}

const typeLabels: Record<string, string> = {
  saas: "SaaS",
  mobile: "Mobile App",
  physical: "Physical Product",
  service: "Service",
  other: "Other",
};

export default function EditProduct() {
  const { product, companies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/products" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Products
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Product</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-6">
          <ManageField label="Name *" htmlFor="name">
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={product.name}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Description * (Markdown)" htmlFor="description">
            <textarea
              id="description"
              name="description"
              required
              rows={8}
              defaultValue={product.description}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <ManageField label="Website" htmlFor="website">
            <input
              type="url"
              id="website"
              name="website"
              defaultValue={product.website || ""}
              placeholder="https://..."
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="type" className="font-medium text-harbour-700">
                Type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={product.type}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                {productTypes.map((t) => (
                  <option key={t} value={t}>
                    {typeLabels[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="companyId" className="font-medium text-harbour-700">
                Company
              </label>
              <select
                id="companyId"
                name="companyId"
                defaultValue={product.companyId ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                <option value="">None</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ImageUpload
              label="Logo"
              name="logoData"
              existingName="existingLogo"
              aspect={1}
              existingImage={product.logo}
              previewStyle="square"
              helpText="Upload logo (1:1)"
            />
            <ImageUpload
              label="Cover Image"
              name="coverImageData"
              existingName="existingCoverImage"
              aspect={16 / 9}
              existingImage={product.coverImage}
              previewStyle="cover"
              helpText="Upload cover (16:9)"
            />
          </div>

          <ManageSubmitButton>Update Product</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
