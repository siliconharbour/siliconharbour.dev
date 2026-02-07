import type { Route } from "./+types/review";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useEffect, useState, useCallback } from "react";
import { requireAuth } from "~/lib/session.server";
import {
  getHiddenCompanies,
  updateCompany,
  deleteCompany,
  createCompany,
  getCompanyById,
} from "~/lib/companies.server";
import { blockItem, unblockItem } from "~/lib/import-blocklist.server";
import {
  processAndSaveCoverImage,
  processAndSaveIconImage,
  deleteImage,
} from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { Toast } from "~/components/Toast";
import type { Company } from "~/db/schema";

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase() + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url.toLowerCase();
  }
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Review Companies - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const companies = await getHiddenCompanies();
  return { companies };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const id = parseInt(formData.get("id") as string, 10);

  if (isNaN(id) && intent !== "undo-reject") {
    return { error: "Invalid company ID" };
  }

  // Get company data for undo support (before any modifications)
  let companyData: Company | null = null;
  if (intent === "approve" || intent === "reject") {
    companyData = await getCompanyById(id);
  }

  switch (intent) {
    case "approve": {
      await updateCompany(id, { visible: true });
      return {
        success: true,
        action: "approved",
        undoData: companyData ? { id, previousVisible: false } : null,
      };
    }

    case "reject": {
      if (!companyData) {
        return { error: "Company not found" };
      }

      // Determine source for blocklist based on directory flags
      const source = companyData.technl ? "technl" : companyData.genesis ? "genesis" : null;

      // Add to blocklist if it came from an import
      if (source) {
        const externalId = companyData.website
          ? normalizeUrl(companyData.website)
          : companyData.name.toLowerCase();
        await blockItem(source, externalId, companyData.name, "Rejected during review");
      }

      // Delete the company
      await deleteCompany(id);

      return {
        success: true,
        action: "rejected",
        undoData: {
          ...companyData,
          source,
        },
      };
    }

    case "undo-approve": {
      await updateCompany(id, { visible: false });
      return { success: true, action: "undone" };
    }

    case "undo-reject": {
      // Recreate the company from the stored data
      const companyJson = formData.get("companyData") as string;
      const source = formData.get("source") as string | null;

      if (!companyJson) {
        return { error: "No company data for undo" };
      }

      const data = JSON.parse(companyJson) as Company;

      // Remove from blocklist if it was blocked
      if (source) {
        const externalId = data.website ? normalizeUrl(data.website) : data.name.toLowerCase();
        await unblockItem(source, externalId);
      }

      // Recreate the company (without id/slug - they'll be regenerated)
      await createCompany({
        name: data.name,
        description: data.description,
        website: data.website,
        wikipedia: data.wikipedia,
        github: data.github,
        email: data.email,
        location: data.location,
        founded: data.founded,
        logo: data.logo,
        coverImage: data.coverImage,
        technl: data.technl,
        genesis: data.genesis,
        visible: false,
      });

      return { success: true, action: "undone" };
    }

    case "update": {
      const existingCompany = await getCompanyById(id);
      if (!existingCompany) {
        return { error: "Company not found" };
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
      const approveAfterSave = formData.get("approveAfterSave") === "on";

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
        visible: approveAfterSave,
        ...(logo !== undefined && { logo }),
        ...(coverImage !== undefined && { coverImage }),
      });

      return {
        success: true,
        action: approveAfterSave ? "approved" : "updated",
      };
    }

    default:
      return { error: "Unknown action" };
  }
}

interface UndoAction {
  type: "approve" | "reject";
  id: number;
  name: string;
  companyData?: Company & { source?: string | null };
}

export default function ReviewCompanies() {
  const { companies: initialCompanies } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [companies, setCompanies] = useState(initialCompanies);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentCompany = companies[currentIndex];
  const remaining = companies.length - currentIndex;

  // Keep edit mode scoped to the current card.
  useEffect(() => {
    setEditMode(false);
  }, [currentCompany?.id]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if in edit mode or if typing in an input
      if (editMode) {
        if (e.key === "Escape") {
          setEditMode(false);
        }
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "y":
          if (currentCompany) handleApprove();
          break;
        case "n":
          if (currentCompany) handleSkip();
          break;
        case "d":
          if (currentCompany) handleReject();
          break;
        case "e":
          if (currentCompany) setEditMode(true);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentCompany, editMode]);

  const advanceToNext = useCallback(() => {
    setCompanies((prev) => {
      const newCompanies = [...prev];
      newCompanies.splice(currentIndex, 1);
      return newCompanies;
    });
    // Index stays the same since we removed an item
  }, [currentIndex]);

  // Handle fetcher response
  useEffect(() => {
    if (
      fetcher.data?.success &&
      fetcher.data.action !== "undone" &&
      fetcher.data.action !== "updated"
    ) {
      // Action completed, advance to next
      advanceToNext();
    }
  }, [fetcher.data, advanceToNext]);

  const handleApprove = () => {
    if (!currentCompany) return;

    setLastAction({
      type: "approve",
      id: currentCompany.id,
      name: currentCompany.name,
    });
    setToastMessage(`"${currentCompany.name}" approved`);

    fetcher.submit({ intent: "approve", id: currentCompany.id.toString() }, { method: "post" });
  };

  const handleSkip = () => {
    if (currentIndex < companies.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleReject = () => {
    if (!currentCompany) return;

    setLastAction({
      type: "reject",
      id: currentCompany.id,
      name: currentCompany.name,
      companyData: {
        ...currentCompany,
        source: currentCompany.technl ? "technl" : currentCompany.genesis ? "genesis" : null,
      },
    });
    setToastMessage(`"${currentCompany.name}" rejected and blocked`);

    fetcher.submit({ intent: "reject", id: currentCompany.id.toString() }, { method: "post" });
  };

  const handleUndo = () => {
    if (!lastAction) return;

    if (lastAction.type === "approve") {
      fetcher.submit({ intent: "undo-approve", id: lastAction.id.toString() }, { method: "post" });
      // Add the company back to the list
      // We'd need to refetch, but for now just reload
      window.location.reload();
    } else if (lastAction.type === "reject" && lastAction.companyData) {
      fetcher.submit(
        {
          intent: "undo-reject",
          companyData: JSON.stringify(lastAction.companyData),
          source: lastAction.companyData.source || "",
        },
        { method: "post" },
      );
      window.location.reload();
    }

    setLastAction(null);
    setToastMessage(null);
  };

  const handleDismissToast = () => {
    setToastMessage(null);
    setLastAction(null);
  };

  // Empty state - all done!
  if (companies.length === 0 || !currentCompany) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-2xl mx-auto flex flex-col items-center justify-center gap-6 py-20">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-semibold text-harbour-700">All caught up!</h1>
          <p className="text-harbour-500 text-center">
            There are no more companies to review. Great work!
          </p>
          <Link
            to="/manage/companies"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            Back to Companies
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link
              to="/manage/companies"
              className="text-sm text-harbour-400 hover:text-harbour-600"
            >
              &larr; Back to Companies
            </Link>
            <h1 className="text-2xl font-semibold text-harbour-700 mt-1">Review Companies</h1>
          </div>
          <div className="text-sm text-harbour-500">{remaining} remaining</div>
        </div>

        {/* Company Card */}
        <div className="bg-white border border-harbour-200 shadow-sm">
          {/* Card Header */}
          <div className="p-6 border-b border-harbour-100">
            <div className="flex gap-4">
              {currentCompany.logo ? (
                <img
                  src={`/images/${currentCompany.logo}`}
                  alt=""
                  className="w-16 h-16 object-contain shrink-0"
                />
              ) : (
                <div className="w-16 h-16 bg-harbour-100 flex items-center justify-center shrink-0">
                  <span className="text-2xl text-harbour-400">{currentCompany.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-harbour-700 truncate">
                  {currentCompany.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-harbour-500">
                  {currentCompany.website && (
                    <a
                      href={currentCompany.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-harbour-700"
                    >
                      {new URL(currentCompany.website).hostname.replace(/^www\./, "")}
                    </a>
                  )}
                  {currentCompany.location && (
                    <>
                      {currentCompany.website && <span>·</span>}
                      <span>{currentCompany.location}</span>
                    </>
                  )}
                  {currentCompany.technl && (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs">TechNL</span>
                  )}
                  {currentCompany.genesis && (
                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs">
                      Genesis
                    </span>
                  )}
                </div>
              </div>
            </div>

            {currentCompany.description && !editMode && (
              <p className="mt-4 text-sm text-harbour-600 line-clamp-3">
                {currentCompany.description}
              </p>
            )}
          </div>

          {/* Edit Form (expandable) */}
          {editMode ? (
            <fetcher.Form
              key={currentCompany.id}
              method="post"
              className="p-6 bg-harbour-50 flex flex-col gap-4"
            >
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="id" value={currentCompany.id} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="name" className="text-sm font-medium text-harbour-700">
                    Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    defaultValue={currentCompany.name}
                    className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="website" className="text-sm font-medium text-harbour-700">
                    Website
                  </label>
                  <input
                    type="url"
                    id="website"
                    name="website"
                    defaultValue={currentCompany.website ?? ""}
                    className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="description" className="text-sm font-medium text-harbour-700">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  defaultValue={currentCompany.description ?? ""}
                  className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="location" className="text-sm font-medium text-harbour-700">
                    Location
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    defaultValue={currentCompany.location ?? ""}
                    className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="founded" className="text-sm font-medium text-harbour-700">
                    Founded
                  </label>
                  <input
                    type="text"
                    id="founded"
                    name="founded"
                    placeholder="e.g., 2015"
                    defaultValue={currentCompany.founded ?? ""}
                    className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="github" className="text-sm font-medium text-harbour-700">
                    GitHub Org
                  </label>
                  <input
                    type="url"
                    id="github"
                    name="github"
                    defaultValue={currentCompany.github ?? ""}
                    className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ImageUpload
                  label="Logo"
                  name="logoData"
                  existingName="existingLogo"
                  aspect={1}
                  existingImage={currentCompany.logo}
                  previewStyle="square"
                  helpText="1:1 ratio"
                />
                <ImageUpload
                  label="Cover Image"
                  name="coverImageData"
                  existingName="existingCoverImage"
                  aspect={16 / 9}
                  existingImage={currentCompany.coverImage}
                  previewStyle="cover"
                  helpText="16:9 ratio"
                />
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="technl"
                    defaultChecked={currentCompany.technl ?? false}
                  />
                  <span className="text-sm text-harbour-600">TechNL</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="genesis"
                    defaultChecked={currentCompany.genesis ?? false}
                  />
                  <span className="text-sm text-harbour-600">Genesis</span>
                </label>
                <label className="flex items-center gap-2 ml-auto">
                  <input type="checkbox" name="approveAfterSave" defaultChecked />
                  <span className="text-sm text-harbour-600 font-medium">
                    Make visible after save
                  </span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white text-sm font-medium transition-colors"
                >
                  Save & Continue
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 text-harbour-600 hover:bg-harbour-100 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </fetcher.Form>
          ) : (
            /* Action Buttons */
            <div className="p-6 flex flex-wrap gap-3">
              <button
                onClick={handleApprove}
                disabled={fetcher.state !== "idle"}
                className="flex-1 min-w-[100px] px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors flex flex-col items-center"
              >
                <span>Approve</span>
                <span className="text-xs text-green-200">(Y)</span>
              </button>
              <button
                onClick={handleSkip}
                disabled={fetcher.state !== "idle" || currentIndex >= companies.length - 1}
                className="flex-1 min-w-[100px] px-4 py-3 bg-harbour-200 hover:bg-harbour-300 disabled:bg-harbour-100 text-harbour-700 font-medium transition-colors flex flex-col items-center"
              >
                <span>Skip</span>
                <span className="text-xs text-harbour-500">(N)</span>
              </button>
              <button
                onClick={handleReject}
                disabled={fetcher.state !== "idle"}
                className="flex-1 min-w-[100px] px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium transition-colors flex flex-col items-center"
              >
                <span>Reject</span>
                <span className="text-xs text-red-200">(D)</span>
              </button>
              <button
                onClick={() => setEditMode(true)}
                disabled={fetcher.state !== "idle"}
                className="flex-1 min-w-[100px] px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-medium transition-colors flex flex-col items-center"
              >
                <span>Edit</span>
                <span className="text-xs text-amber-200">(E)</span>
              </button>
            </div>
          )}
        </div>

        {/* Keyboard shortcuts help */}
        <div className="text-center text-xs text-harbour-400">
          Keyboard: <kbd className="px-1 py-0.5 bg-harbour-100 rounded">Y</kbd> Approve ·
          <kbd className="px-1 py-0.5 bg-harbour-100 rounded ml-1">N</kbd> Skip ·
          <kbd className="px-1 py-0.5 bg-harbour-100 rounded ml-1">D</kbd> Reject ·
          <kbd className="px-1 py-0.5 bg-harbour-100 rounded ml-1">E</kbd> Edit ·
          <kbd className="px-1 py-0.5 bg-harbour-100 rounded ml-1">Esc</kbd> Cancel edit
        </div>
      </div>

      {/* Toast notification */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          actionLabel={lastAction ? "Undo" : undefined}
          onAction={lastAction ? handleUndo : undefined}
          onDismiss={handleDismissToast}
        />
      )}
    </div>
  );
}
