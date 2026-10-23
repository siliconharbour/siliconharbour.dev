import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/review";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { requireAdmin } from "~/lib/session.server";
import { getHiddenCompanies } from "~/lib/companies.server";

import { ImageUpload } from "~/components/ImageUpload";
import { Toast } from "~/components/Toast";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Review Companies - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const companies = await getHiddenCompanies();
  return { companies };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const intent = form.get("intent");

  if (intent === "undo-reject") {
    const result = await runAdminOperation(request, operationCatalog.rejectedRecordRestore, {
      id: Number(form.get("restoreId")),
      confirm: true,
    });
    return result.ok ? { success: true, action: "undone" as const } : { error: result.error };
  }
  if (intent === "approve") {
    const result = await runAdminOperation(request, operationCatalog.companyApprove, { id });
    return result.ok ? { success: true, action: "approved" as const, id } : { error: result.error };
  }
  if (intent === "reject") {
    const result = await runAdminOperation(request, operationCatalog.companyReject, {
      id,
      confirm: true,
    });
    return result.ok
      ? {
          success: true,
          action: "rejected" as const,
          id,
          restoreId: result.data.restoreId,
        }
      : { error: result.error };
  }
  if (intent === "undo-approve") {
    const result = await runAdminOperation(request, operationCatalog.companyUnapprove, { id });
    return result.ok ? { success: true, action: "undone" as const } : { error: result.error };
  }
  if (intent === "update") {
    const result = await runAdminOperation(request, operationCatalog.companyUpdate, {
      id,
      ...directoryFormInput("company", form, true, [
        "name",
        "description",
        "website",
        "wikipedia",
        "linkedin",
        "github",
        "location",
        "founded",
        "technl",
        "genesis",
        "logo",
        "coverImage",
      ]),
      ...(form.get("approveAfterSave") === "on" ? { visible: true } : {}),
    });
    return result.ok ? { success: true, action: "updated" as const } : { error: result.error };
  }
  return { error: "Unknown action" };
}

type UndoAction = { type: "approve"; id: number } | { type: "reject"; restoreId: number };

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

  useEffect(() => {
    setEditMode(false);
  }, [currentCompany?.id]);

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

  useEffect(() => {
    if (!fetcher.data?.success) return;
    if (fetcher.data.action === "undone") {
      window.location.reload();
      return;
    }
    if (fetcher.data.action === "approved") setLastAction({ type: "approve", id: fetcher.data.id });
    if (fetcher.data.action === "rejected")
      setLastAction({ type: "reject", restoreId: fetcher.data.restoreId });
    if (fetcher.data.action !== "updated") {
      const id = fetcher.data.id;
      setCompanies((rows) => rows.filter((row) => row.id !== id));
    }
  }, [fetcher.data]);

  const handleApprove = () => {
    if (!currentCompany) return;

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

    setToastMessage(`"${currentCompany.name}" rejected and blocked`);

    fetcher.submit({ intent: "reject", id: currentCompany.id.toString() }, { method: "post" });
  };

  const handleUndo = () => {
    if (!lastAction) return;
    if (lastAction.type === "approve") {
      fetcher.submit({ intent: "undo-approve", id: String(lastAction.id) }, { method: "post" });
    } else {
      fetcher.submit(
        { intent: "undo-reject", restoreId: String(lastAction.restoreId) },
        { method: "post" },
      );
    }
    setLastAction(null);
    setToastMessage(null);
  };

  const handleDismissToast = () => {
    setToastMessage(null);
    setLastAction(null);
  };

  const toast = toastMessage ? (
    <Toast
      message={toastMessage}
      actionLabel={lastAction ? "Undo" : undefined}
      onAction={lastAction ? handleUndo : undefined}
      onDismiss={handleDismissToast}
    />
  ) : null;

  if (companies.length === 0 || !currentCompany) {
    return (
      <div className="min-h-screen p-pad-4 md:p-pad-6">
        <div className="max-w-2xl mx-auto flex flex-col items-center justify-center gap-gap-6 py-pad-20">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-semibold text-heading">All caught up!</h1>
          <p className="text-muted text-center">
            There are no more companies to review. Great work!
          </p>
          <Link
            to="/manage/companies"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            Back to Companies
          </Link>
          <Link to="/manage/rejected-records" className="text-sm text-body underline">
            Rejected records
          </Link>
        </div>
        {toast}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link to="/manage/companies" className="text-sm text-subtle hover:text-body">
              &larr; Back to Companies
            </Link>
            <h1 className="text-2xl font-semibold text-heading mt-1">Review Companies</h1>
          </div>
          <div className="text-sm text-muted">{remaining} remaining</div>
        </div>

        {/* Company Card */}
        <div className="bg-surface border border-line  rounded-panel">
          {/* Card Header */}
          <div className="p-pad-6 border-b border-harbour-100">
            <div className="flex gap-gap-4">
              {currentCompany.logo ? (
                <img
                  src={`/images/${currentCompany.logo}`}
                  alt=""
                  className="w-16 h-16 object-contain shrink-0"
                />
              ) : (
                <div className="w-16 h-16 bg-tint flex items-center justify-center shrink-0">
                  <span className="text-2xl text-subtle">{currentCompany.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-heading truncate">
                  {currentCompany.name}
                </h2>
                <div className="flex flex-wrap items-center gap-gap-2 mt-1 text-sm text-muted">
                  {currentCompany.website && (
                    <a
                      href={currentCompany.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-heading"
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
                    <span className="px-pad-1-5 py-pad-0-5 bg-blue-100 text-blue-700 text-xs">
                      TechNL
                    </span>
                  )}
                  {currentCompany.genesis && (
                    <span className="px-pad-1-5 py-pad-0-5 bg-green-100 text-green-700 text-xs">
                      Genesis
                    </span>
                  )}
                </div>
              </div>
            </div>

            {currentCompany.description && !editMode && (
              <p className="mt-4 text-sm text-body line-clamp-3">{currentCompany.description}</p>
            )}
          </div>

          {/* Edit Form (expandable) */}
          {editMode ? (
            <fetcher.Form
              key={currentCompany.id}
              method="post"
              className="p-pad-6 bg-soft flex flex-col gap-gap-4"
            >
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="id" value={currentCompany.id} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
                <div className="flex flex-col gap-gap-1">
                  <label htmlFor="name" className="text-sm font-medium text-heading">
                    Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    defaultValue={currentCompany.name}
                    className="px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-gap-1">
                  <label htmlFor="website" className="text-sm font-medium text-heading">
                    Website
                  </label>
                  <input
                    type="url"
                    id="website"
                    name="website"
                    defaultValue={currentCompany.website ?? ""}
                    className="px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-gap-1">
                <label htmlFor="description" className="text-sm font-medium text-heading">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  defaultValue={currentCompany.description ?? ""}
                  className="px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-gap-4">
                <div className="flex flex-col gap-gap-1">
                  <label htmlFor="location" className="text-sm font-medium text-heading">
                    Location
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    defaultValue={currentCompany.location ?? ""}
                    className="px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-gap-1">
                  <label htmlFor="founded" className="text-sm font-medium text-heading">
                    Founded
                  </label>
                  <input
                    type="text"
                    id="founded"
                    name="founded"
                    placeholder="e.g., 2015"
                    defaultValue={currentCompany.founded ?? ""}
                    className="px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-gap-1">
                  <label htmlFor="github" className="text-sm font-medium text-heading">
                    GitHub Org
                  </label>
                  <input
                    type="url"
                    id="github"
                    name="github"
                    defaultValue={currentCompany.github ?? ""}
                    className="px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-gap-1">
                  <label htmlFor="linkedin" className="text-sm font-medium text-heading">
                    LinkedIn
                  </label>
                  <input
                    type="url"
                    id="linkedin"
                    name="linkedin"
                    defaultValue={currentCompany.linkedin ?? ""}
                    className="px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
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

              <div className="flex flex-wrap gap-gap-4">
                <label className="flex items-center gap-gap-2">
                  <input
                    type="checkbox"
                    name="technl"
                    defaultChecked={currentCompany.technl ?? false}
                  />
                  <span className="text-sm text-body">TechNL</span>
                </label>
                <label className="flex items-center gap-gap-2">
                  <input
                    type="checkbox"
                    name="genesis"
                    defaultChecked={currentCompany.genesis ?? false}
                  />
                  <span className="text-sm text-body">Genesis</span>
                </label>
                <label className="flex items-center gap-gap-2 ml-auto">
                  <input type="checkbox" name="approveAfterSave" defaultChecked />
                  <span className="text-sm text-body font-medium">Make visible after save</span>
                </label>
              </div>

              <div className="flex gap-gap-3 pt-pad-2">
                <button
                  type="submit"
                  className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
                >
                  Save & Continue
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="px-pad-4 py-pad-2 text-body hover:bg-tint text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </fetcher.Form>
          ) : (
            /* Action Buttons */
            <div className="p-pad-6 flex flex-wrap gap-gap-3">
              <button
                onClick={handleApprove}
                disabled={fetcher.state !== "idle"}
                className="flex-1 min-w-[100px] px-pad-4 py-pad-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium transition-colors flex flex-col items-center"
              >
                <span>Approve</span>
                <span className="text-xs text-green-200">(Y)</span>
              </button>
              <button
                onClick={handleSkip}
                disabled={fetcher.state !== "idle" || currentIndex >= companies.length - 1}
                className="flex-1 min-w-[100px] px-pad-4 py-pad-3 bg-harbour-200 hover:bg-harbour-300 disabled:bg-tint text-heading font-medium transition-colors flex flex-col items-center"
              >
                <span>Skip</span>
                <span className="text-xs text-muted">(N)</span>
              </button>
              <button
                onClick={handleReject}
                disabled={fetcher.state !== "idle"}
                className="flex-1 min-w-[100px] px-pad-4 py-pad-3 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium transition-colors flex flex-col items-center"
              >
                <span>Reject</span>
                <span className="text-xs text-red-200">(D)</span>
              </button>
              <button
                onClick={() => setEditMode(true)}
                disabled={fetcher.state !== "idle"}
                className="flex-1 min-w-[100px] px-pad-4 py-pad-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-medium transition-colors flex flex-col items-center"
              >
                <span>Edit</span>
                <span className="text-xs text-amber-200">(E)</span>
              </button>
            </div>
          )}
        </div>

        {/* Keyboard shortcuts help */}
        <div className="text-center text-xs text-subtle">
          Keyboard: <kbd className="px-pad-1 py-pad-0-5 bg-tint">Y</kbd> Approve ·
          <kbd className="px-pad-1 py-pad-0-5 bg-tint ml-1">N</kbd> Skip ·
          <kbd className="px-pad-1 py-pad-0-5 bg-tint ml-1">D</kbd> Reject ·
          <kbd className="px-pad-1 py-pad-0-5 bg-tint ml-1">E</kbd> Edit ·
          <kbd className="px-pad-1 py-pad-0-5 bg-tint ml-1">Esc</kbd> Cancel edit
        </div>
      </div>

      {toast}
    </div>
  );
}
