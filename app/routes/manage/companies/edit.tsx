import type { Route } from "./+types/edit";
import { Link, redirect, useActionData, useLoaderData, Form } from "react-router";
import { requireAuth } from "~/lib/session.server";
import { getCompanyById, updateCompany, deleteCompany } from "~/lib/companies.server";
import { convertCompanyToEducation } from "~/lib/education.server";
import {
  processAndSaveCoverImage,
  processAndSaveIconImage,
  deleteImage,
} from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { blockItem } from "~/lib/import-blocklist.server";

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase() + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url.toLowerCase();
  }
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.company?.name || "Company"} - siliconharbour.dev` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    throw new Response("Invalid company ID", { status: 400 });
  }

  const company = await getCompanyById(id);
  if (!company) {
    throw new Response("Company not found", { status: 404 });
  }

  return { company };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAuth(request);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return { error: "Invalid company ID" };
  }

  const existingCompany = await getCompanyById(id);
  if (!existingCompany) {
    return { error: "Company not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Handle import block action
  if (intent === "import-block") {
    const source = formData.get("source") as string;

    if (!source) {
      return { error: "No import source specified" };
    }

    // Use normalized website URL as external ID, or name if no website
    // Must match the normalization used in the import page
    const externalId = existingCompany.website
      ? normalizeUrl(existingCompany.website)
      : existingCompany.name.toLowerCase();

    await blockItem(source, externalId, existingCompany.name, "Blocked from edit page");
    await deleteCompany(id);

    return redirect("/manage/companies");
  }

  // Handle convert to institution
  if (intent === "convertToEducation") {
    const institutionType = (formData.get("institutionType") as string) || "other";
    try {
      const institution = await convertCompanyToEducation(
        id,
        institutionType as "university" | "college" | "bootcamp" | "online" | "other",
      );
      return redirect(`/manage/education/${institution.id}`);
    } catch (error) {
      console.error("Failed to convert company to institution:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return { error: `Failed to convert company to institution: ${message}` };
    }
  }

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const website = (formData.get("website") as string) || null;
  const wikipedia = (formData.get("wikipedia") as string) || null;
  const github = (formData.get("github") as string) || null;
  const location = (formData.get("location") as string) || null;
  const founded = (formData.get("founded") as string) || null;
  const technl = formData.get("technl") === "on";
  const genesis = formData.get("genesis") === "on";
  const visible = formData.get("visible") === "true";

  if (!name) {
    return { error: "Name is required" };
  }

  // Process images
  let logo: string | null | undefined = undefined;
  let coverImage: string | null | undefined = undefined;

  const logoData = formData.get("logoData") as string | null;
  const coverImageData = formData.get("coverImageData") as string | null;
  const existingLogo = formData.get("existingLogo") as string | null;
  const existingCoverImage = formData.get("existingCoverImage") as string | null;

  // Handle logo
  if (logoData) {
    if (existingCompany.logo) {
      await deleteImage(existingCompany.logo);
    }
    const base64Data = logoData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    logo = await processAndSaveIconImage(buffer);
  } else if (existingLogo) {
    logo = existingLogo;
  } else if (existingCompany.logo) {
    await deleteImage(existingCompany.logo);
    logo = null;
  }

  // Handle cover image
  if (coverImageData) {
    if (existingCompany.coverImage) {
      await deleteImage(existingCompany.coverImage);
    }
    const base64Data = coverImageData.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");
    coverImage = await processAndSaveCoverImage(buffer);
  } else if (existingCoverImage) {
    coverImage = existingCoverImage;
  } else if (existingCompany.coverImage) {
    await deleteImage(existingCompany.coverImage);
    coverImage = null;
  }

  await updateCompany(id, {
    name,
    description,
    website,
    wikipedia,
    github,
    location,
    founded,
    technl,
    genesis,
    visible,
    ...(logo !== undefined && { logo }),
    ...(coverImage !== undefined && { coverImage }),
  });

  return redirect("/manage/companies");
}

export default function EditCompany() {
  const { company } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/manage/companies" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Companies
          </Link>
        </div>

        <h1 className="text-2xl font-semibold text-harbour-700">Edit Company</h1>

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
              defaultValue={company.name}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="font-medium text-harbour-700">
              Description (Markdown)
            </label>
            <textarea
              id="description"
              name="description"
              rows={8}
              defaultValue={company.description ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono text-sm"
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
              defaultValue={company.website ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="wikipedia" className="font-medium text-harbour-700">
              Wikipedia
            </label>
            <input
              type="url"
              id="wikipedia"
              name="wikipedia"
              placeholder="https://en.wikipedia.org/wiki/..."
              defaultValue={company.wikipedia ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="github" className="font-medium text-harbour-700">
              GitHub Organization
            </label>
            <input
              type="url"
              id="github"
              name="github"
              placeholder="https://github.com/org-name"
              defaultValue={company.github ?? ""}
              className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="location" className="font-medium text-harbour-700">
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                defaultValue={company.location ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="founded" className="font-medium text-harbour-700">
                Founded
              </label>
              <input
                type="text"
                id="founded"
                name="founded"
                placeholder="e.g., 2015"
                defaultValue={company.founded ?? ""}
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ImageUpload
              label="Logo"
              name="logoData"
              existingName="existingLogo"
              aspect={1}
              existingImage={company.logo}
              previewStyle="square"
              helpText="Upload logo (1:1)"
            />
            <ImageUpload
              label="Cover Image"
              name="coverImageData"
              existingName="existingCoverImage"
              aspect={16 / 9}
              existingImage={company.coverImage}
              previewStyle="cover"
              helpText="Upload cover (16:9)"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium text-harbour-700">Directory Listings</span>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="technl"
                  defaultChecked={company.technl ?? false}
                  className="rounded"
                />
                <span className="text-sm text-harbour-600">TechNL Member</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="genesis"
                  defaultChecked={company.genesis ?? false}
                  className="rounded"
                />
                <span className="text-sm text-harbour-600">Genesis Centre</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium text-harbour-700">Visibility</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="visible"
                value="true"
                defaultChecked={company.visible ?? true}
                className="rounded"
              />
              <span className="text-sm text-harbour-600">Visible on public site</span>
            </label>
            <p className="text-xs text-harbour-400">
              Uncheck to hide this company from public listings while you review/edit their profile.
            </p>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
          >
            Update Company
          </button>
        </Form>

        {/* Convert to Institution section */}
        <div className="border-t border-harbour-200 pt-6 mt-6">
          <h2 className="text-lg font-semibold text-harbour-700 mb-4">
            Convert to Education Institution
          </h2>
          <p className="text-sm text-harbour-500 mb-4">
            This will move the company to the Education directory. The company entry will be deleted
            and a new education institution will be created with the same data.
          </p>
          <Form method="post" className="flex flex-wrap items-end gap-4">
            <input type="hidden" name="intent" value="convertToEducation" />
            <div className="flex flex-col gap-2">
              <label htmlFor="institutionType" className="text-sm font-medium text-harbour-700">
                Institution Type
              </label>
              <select
                id="institutionType"
                name="institutionType"
                className="px-3 py-2 border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              >
                <option value="university">University</option>
                <option value="college">College</option>
                <option value="bootcamp">Bootcamp</option>
                <option value="online">Online</option>
                <option value="other">Other</option>
              </select>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors"
              onClick={(e) => {
                if (
                  !confirm(
                    `Are you sure you want to convert "${company.name}" to an education institution? This will delete the company entry.`,
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              Convert to Institution
            </button>
          </Form>
        </div>

        {/* Import Block section - only show for companies from TechNL or Genesis */}
        {(company.technl || company.genesis) && (
          <div className="border-t border-harbour-200 pt-6 mt-6">
            <h2 className="text-lg font-semibold text-harbour-700 mb-2">Import Block</h2>
            <p className="text-sm text-harbour-500 mb-4">
              Add this company to the import block list to prevent it from being re-imported from{" "}
              {company.technl && company.genesis
                ? "TechNL or Genesis"
                : company.technl
                  ? "TechNL"
                  : "Genesis"}{" "}
              in the future. This will also delete the current record.
            </p>
            <div className="flex flex-wrap gap-3">
              {company.technl && (
                <Form method="post">
                  <input type="hidden" name="intent" value="import-block" />
                  <input type="hidden" name="source" value="technl" />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                    onClick={(e) => {
                      if (
                        !confirm(
                          `Add "${company.name}" to TechNL import block list and delete? This prevents this company from being imported from TechNL again.`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    Block from TechNL Import
                  </button>
                </Form>
              )}
              {company.genesis && (
                <Form method="post">
                  <input type="hidden" name="intent" value="import-block" />
                  <input type="hidden" name="source" value="genesis" />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                    onClick={(e) => {
                      if (
                        !confirm(
                          `Add "${company.name}" to Genesis import block list and delete? This prevents this company from being imported from Genesis again.`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    Block from Genesis Import
                  </button>
                </Form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
