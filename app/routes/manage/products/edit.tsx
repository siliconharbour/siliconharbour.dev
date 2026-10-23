import {
  loadAllAdminItems,
  loadAdminOperation,
  runAdminOperation,
} from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";

import { requireAdmin } from "~/lib/session.server";

import { ImageUpload } from "~/components/ImageUpload";
import { productTypes } from "~/db/schema";
import { parseIdOrThrow } from "~/lib/admin/route";

import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.product?.name || "Product"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const id = parseIdOrThrow(params.id, "product");

  const product = await loadAdminOperation(request, operationCatalog.productGet, { id });

  const companies = await loadAllAdminItems(request, operationCatalog.companyList, {
    sort: "name",
    order: "asc",
  });

  return { product, companies };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();

  const result = await runAdminOperation(request, operationCatalog.productUpdate, {
    id: Number(params.id),
    ...directoryFormInput("product", form, true),
  });
  if (!result.ok) return { error: result.error };
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
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-gap-6">
        <div>
          <Link to="/manage/products" className="text-sm text-subtle hover:text-body">
            &larr; Back to Products
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-heading">Edit Product</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-gap-6">
          <ManageField label="Name *" htmlFor="name">
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={product.name}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Description * (Markdown)" htmlFor="description">
            <textarea
              id="description"
              name="description"
              required
              rows={8}
              defaultValue={product.description}
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
            />
          </ManageField>

          <ManageField label="Website" htmlFor="website">
            <input
              type="url"
              id="website"
              name="website"
              defaultValue={product.website || ""}
              placeholder="https://..."
              className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <div className="grid grid-cols-2 gap-gap-4">
            <div className="flex flex-col gap-gap-2">
              <label htmlFor="type" className="font-medium text-heading">
                Type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={product.type}
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                {productTypes.map((t) => (
                  <option key={t} value={t}>
                    {typeLabels[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-gap-2">
              <label htmlFor="companyId" className="font-medium text-heading">
                Company
              </label>
              <select
                id="companyId"
                name="companyId"
                defaultValue={product.companyId ?? ""}
                className="px-pad-3 py-pad-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-6">
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
