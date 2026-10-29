import { externalLinkKeys, externalLinkLabels } from "~/lib/links";
import { BlockReasonField } from "~/components/manage/BlockReasonField";
import { optionalBlockReason } from "~/lib/admin/form";
import { loadAllAdminItems, runAdminOperation } from "~/lib/admin/run-operation.server";
import { operationCatalog } from "~/operations/catalog";
import { directoryFormInput } from "~/lib/admin/form-adapters";
import type { Route } from "./+types/review";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { requireAdmin } from "~/lib/session.server";

import { ImageUpload } from "~/components/ImageUpload";
import { Toast } from "~/components/Toast";

// Safely extract display text from a URL, falling back to the original string
function getDisplayUrl(url: string): string {
  try {
    const parsed = new URL(ensureProtocol(url));
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Ensure a URL has a protocol prefix
function ensureProtocol(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `https://${url}`;
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Review People - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const people = await loadAllAdminItems(request, operationCatalog.personList, {
    visible: false,
    sort: "createdAt",
    order: "desc",
  });
  return { people };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const intent = form.get("intent");
  if (intent === "bulk-reject") {
    const result = await runAdminOperation(request, operationCatalog.personBulkReject, {
      pattern: form.get("pattern"),
      ...optionalBlockReason(form),
      confirm: true,
    });
    return result.ok
      ? {
          success: true,
          action: "bulk-rejected" as const,
          bulkRejectedCount: result.data.count,
          pattern: String(form.get("pattern")),
        }
      : { error: result.error };
  }
  if (intent === "undo-reject") {
    const result = await runAdminOperation(request, operationCatalog.rejectedRecordRestore, {
      id: Number(form.get("restoreId")),
      confirm: true,
    });
    return result.ok ? { success: true, action: "undone" as const } : { error: result.error };
  }
  if (intent === "approve") {
    const result = await runAdminOperation(request, operationCatalog.personApprove, { id });
    return result.ok ? { success: true, action: "approved" as const, id } : { error: result.error };
  }
  if (intent === "reject") {
    const result = await runAdminOperation(request, operationCatalog.personReject, {
      id,
      ...optionalBlockReason(form),
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
    const result = await runAdminOperation(request, operationCatalog.personUnapprove, { id });
    return result.ok ? { success: true, action: "undone" as const } : { error: result.error };
  }
  if (intent === "update") {
    const result = await runAdminOperation(request, operationCatalog.personUpdate, {
      id,
      ...directoryFormInput("person", form, true, [
        "name",
        "bio",
        "website",
        "externalLinks",
        "avatar",
      ]),
      ...(form.get("approveAfterSave") === "on" ? { visible: true } : {}),
    });
    return result.ok ? { success: true, action: "updated" as const } : { error: result.error };
  }
  return { error: "Unknown action" };
}

type UndoAction = { type: "approve"; id: number } | { type: "reject"; restoreId: number };

export default function ReviewPeople() {
  const [rejectionReason, setRejectionReason] = useState("");
  const { people: initialPeople } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [people, setPeople] = useState(initialPeople);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [openPersonPageInNewTab, setOpenPersonPageInNewTab] = useState(false);
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentPerson = people[currentIndex];
  const remaining = people.length - currentIndex;

  const externalLinks = currentPerson?.externalLinks ?? {};

  useEffect(() => {
    setEditMode(false);
    setRejectionReason("");
  }, [currentPerson?.id]);

  // Optional preview: open the public person page as the current card changes.
  useEffect(() => {
    if (!openPersonPageInNewTab || !currentPerson?.slug) {
      return;
    }
    window.open(`/directory/people/${currentPerson.slug}`, "_blank", "noopener,noreferrer");
  }, [openPersonPageInNewTab, currentPerson?.id, currentPerson?.slug]);

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
          if (currentPerson) handleApprove();
          break;
        case "n":
          if (currentPerson) handleSkip();
          break;
        case "d":
          if (currentPerson) handleReject();
          break;
        case "e":
          if (currentPerson) setEditMode(true);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPerson, editMode, rejectionReason]);

  useEffect(() => {
    if (fetcher.data?.success) {
      if (fetcher.data.action === "undone") {
        window.location.reload();
        return;
      }
      if (fetcher.data.action === "approved")
        setLastAction({ type: "approve", id: fetcher.data.id });
      if (fetcher.data.action === "rejected") {
        setLastAction({ type: "reject", restoreId: fetcher.data.restoreId });
      }

      if (fetcher.data.action === "bulk-rejected") {
        // Reload to get fresh list after bulk reject
        setToastMessage(
          `Rejected ${fetcher.data.bulkRejectedCount} people matching "${fetcher.data.pattern}"`,
        );
        setTimeout(() => window.location.reload(), 1500);
      } else if (fetcher.data.action !== "updated") {
        const id = fetcher.data.id;
        setPeople((rows) => rows.filter((row) => row.id !== id));
      }
    }
  }, [fetcher.data]);

  const handleApprove = () => {
    if (!currentPerson) return;

    setToastMessage(`"${currentPerson.name}" approved`);

    fetcher.submit({ intent: "approve", id: currentPerson.id.toString() }, { method: "post" });
  };

  const handleSkip = () => {
    if (currentIndex < people.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleReject = () => {
    if (!currentPerson) return;

    setToastMessage(
      `"${currentPerson.name}" rejected${currentPerson.externalLinks?.github ? " and blocked" : ""}`,
    );

    fetcher.submit(
      { intent: "reject", reason: rejectionReason, id: currentPerson.id.toString() },
      { method: "post" },
    );
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

  if (people.length === 0 || !currentPerson) {
    return (
      <div className="min-h-screen p-pad-4 md:p-pad-6">
        <div className="max-w-2xl mx-auto flex flex-col items-center justify-center gap-gap-6 py-pad-20">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-semibold text-heading">All caught up!</h1>
          <p className="text-muted text-center">There are no more people to review. Great work!</p>
          <Link
            to="/manage/people"
            className="px-pad-4 py-pad-2 bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
          >
            Back to People
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
            <Link to="/manage/people" className="text-sm text-subtle hover:text-body">
              &larr; Back to People
            </Link>
            <h1 className="text-2xl font-semibold text-heading mt-1">Review People</h1>
          </div>
          <div className="flex items-center gap-gap-4">
            <label className="flex items-center gap-gap-2 text-sm text-body">
              <input
                type="checkbox"
                checked={openPersonPageInNewTab}
                onChange={(e) => setOpenPersonPageInNewTab(e.target.checked)}
              />
              <span>Open person page in new tab</span>
            </label>
            <div className="text-sm text-muted">{remaining} remaining</div>
          </div>
        </div>

        {/* Bulk Reject Tool */}
        <details className="border border-line bg-soft">
          <summary className="px-pad-4 py-pad-2 cursor-pointer text-sm font-medium text-body hover:text-harbour-800">
            Bulk Reject Tool
          </summary>
          <div className="p-pad-4 border-t border-line">
            <fetcher.Form method="post" className="flex gap-gap-2">
              <input type="hidden" name="intent" value="bulk-reject" />
              <BlockReasonField />
              <input
                type="text"
                name="pattern"
                placeholder="e.g. Eindhoven, Amsterdam, Netherlands..."
                className="flex-1 px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-pad-4 py-pad-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Reject Matching
              </button>
            </fetcher.Form>
            <p className="mt-2 text-xs text-muted">
              This will reject all people whose name or bio contains the pattern (case-insensitive).
            </p>
          </div>
        </details>

        {/* Person Card */}
        <div className="bg-surface border border-line  rounded-panel">
          {/* Card Header */}
          <div className="p-pad-6 border-b border-harbour-100">
            <div className="flex gap-gap-4">
              {currentPerson.avatar ? (
                <img
                  src={`/images/${currentPerson.avatar}`}
                  alt=""
                  className="w-16 h-16 object-cover  shrink-0"
                />
              ) : (
                <div className="w-16 h-16 bg-tint  flex items-center justify-center shrink-0">
                  <span className="text-2xl text-subtle">{currentPerson.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-heading truncate">
                  {currentPerson.name}
                </h2>
                <div className="flex flex-wrap items-center gap-gap-2 mt-1 text-sm text-muted">
                  {currentPerson.website && (
                    <>
                      <a
                        href={ensureProtocol(currentPerson.website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-heading"
                      >
                        {getDisplayUrl(currentPerson.website)}
                      </a>
                    </>
                  )}
                  {externalLinkKeys.map((key) =>
                    externalLinks[key] ? (
                      <a
                        key={key}
                        href={ensureProtocol(externalLinks[key])}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-heading"
                      >
                        {externalLinkLabels[key]}
                      </a>
                    ) : null,
                  )}
                </div>
              </div>
            </div>

            {currentPerson.bio && !editMode && (
              <p className="mt-4 text-sm text-body line-clamp-3">{currentPerson.bio}</p>
            )}
          </div>

          {/* Edit Form (expandable) */}
          {editMode ? (
            <fetcher.Form
              key={currentPerson.id}
              method="post"
              className="p-pad-6 bg-soft flex flex-col gap-gap-4"
            >
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="id" value={currentPerson.id} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-4">
                <ImageUpload
                  label="Avatar"
                  name="avatarData"
                  existingName="existingAvatar"
                  aspect={1}
                  existingImage={currentPerson.avatar}
                  previewStyle="square"
                  helpText="1:1 ratio"
                />
                <div className="flex flex-col gap-gap-4">
                  <div className="flex flex-col gap-gap-1">
                    <label htmlFor="name" className="text-sm font-medium text-heading">
                      Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      defaultValue={currentPerson.name}
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
                      defaultValue={
                        currentPerson.website ? ensureProtocol(currentPerson.website) : ""
                      }
                      className="px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-gap-1">
                <label htmlFor="bio" className="text-sm font-medium text-heading">
                  Bio
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  rows={4}
                  defaultValue={currentPerson.bio ?? ""}
                  className="px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-gap-4">
                {externalLinkKeys.map((key) => (
                  <div key={key} className="flex flex-col gap-gap-1">
                    <label htmlFor={key} className="text-sm font-medium text-heading">
                      {externalLinkLabels[key]}
                    </label>
                    <input
                      type="url"
                      id={key}
                      name={key}
                      defaultValue={externalLinks[key] ?? ""}
                      className="px-pad-3 py-pad-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end">
                <label className="flex items-center gap-gap-2">
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
              <div className="w-full">
                <BlockReasonField
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                />
              </div>
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
                disabled={fetcher.state !== "idle" || currentIndex >= people.length - 1}
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
