import type { Route } from "./+types/new";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { createProduct } from "~/lib/products.server";
import { getAllCompanies } from "~/lib/companies.server";
import { processAndSaveCoverImage, processAndSaveIconImageWithPadding } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { productTypes } from "~/db/schema";

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

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const website = (formData.get("website") as string) || null;
  const type = formData.get("type") as string;
  const companyId = formData.get("companyId") as string;

  if (!name || !description) {
    return { error: "Name and description are required" };
  }

  // Process images
  let logo: string | null = null;
  let coverImage: string | null = null;

  const logoData = formData.get("logoData") as string | null;
  const coverImageData = formData.get("coverImageData") as string | null;

  if (logoData) {
    const base64Data = logoData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    logo = await processAndSaveIconImageWithPadding(buffer);
  }

  if (coverImageData) {
    const base64Data = coverImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    coverImage = await processAndSaveCoverImage(buffer);
  }

  await createProduct({
    name,
    description,
    website,
    type: type as (typeof productTypes)[number],
    companyId: companyId ? parseInt(companyId, 10) : null,
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

        {actionData?.error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-600">{actionData.error}</div>
        )}

        <Form method="post" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="font-medium text-harbour-700">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="font-medium text-harbour-700">
              Description * (Markdown)
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={8}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
              placeholder="Describe the product. You can use [[References]] to link to companies, people, etc."
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="website" className="font-medium text-harbour-700">
              Website
            </label>
            <input
              type="url"
              id="website"
              name="website"
              placeholder="https://..."
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

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

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Create Product
          </button>
        </Form>
      </div>
    </div>
  );
}
