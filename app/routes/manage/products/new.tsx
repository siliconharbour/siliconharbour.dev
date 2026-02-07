import type { Route } from "./+types/new";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { z } from "zod";
import { requireAuth } from "~/lib/session.server";
import { createProduct } from "~/lib/products.server";
import { getAllCompanies } from "~/lib/companies.server";
import { processAndSaveCoverImage, processAndSaveIconImageWithPadding } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { productTypes } from "~/db/schema";
import { parseFormData, zOptionalNullableString, zRequiredString } from "~/lib/admin/form";
import { actionError } from "~/lib/admin/action-result";
import { createImageFromFormData } from "~/lib/admin/image-fields";
import { ManageErrorAlert, ManageField, ManageSubmitButton } from "~/components/manage/ManageForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New Product - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const companies = await getAllCompanies();
  return { companies };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

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

  const logo = await createImageFromFormData(formData, "logoData", processAndSaveIconImageWithPadding);
  const coverImage = await createImageFromFormData(formData, "coverImageData", processAndSaveCoverImage);

  await createProduct({
    name: parsed.data.name,
    description: parsed.data.description,
    website: parsed.data.website,
    type: parsed.data.type,
    companyId: parsed.data.companyId ? Number.parseInt(parsed.data.companyId, 10) : null,
    logo,
    coverImage,
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

export default function NewProduct() {
  const { companies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/products" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Products
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">New Product</h1>

        {actionData?.error && <ManageErrorAlert error={actionData.error} />}

        <Form method="post" className="flex flex-col gap-6">
          <ManageField label="Name *" htmlFor="name">
            <input
              type="text"
              id="name"
              name="name"
              required
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </ManageField>

          <ManageField label="Description * (Markdown)" htmlFor="description">
            <textarea
              id="description"
              name="description"
              required
              rows={8}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
              placeholder="Describe the product. You can use [[References]] to link to companies, people, etc."
            />
          </ManageField>

          <ManageField label="Website" htmlFor="website">
            <input
              type="url"
              id="website"
              name="website"
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
                defaultValue="other"
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
                defaultValue=""
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
              aspect={1}
              previewStyle="square"
              helpText="Upload logo (1:1)"
            />
            <ImageUpload
              label="Cover Image"
              name="coverImageData"
              aspect={16 / 9}
              previewStyle="cover"
              helpText="Upload cover (16:9)"
            />
          </div>

          <ManageSubmitButton>Create Product</ManageSubmitButton>
        </Form>
      </div>
    </div>
  );
}
