import type { Route } from "./+types/review";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useEffect, useState, useCallback } from "react";
import { requireAuth } from "~/lib/session.server";
import {
  getHiddenPeople,
  updatePerson,
  deletePerson,
  createPerson,
  getPersonById,
} from "~/lib/people.server";
import { blockItem, unblockItem } from "~/lib/import-blocklist.server";
import { processAndSaveIconImage, deleteImage } from "~/lib/images.server";
import { ImageUpload } from "~/components/ImageUpload";
import { Toast } from "~/components/Toast";
import type { Person } from "~/db/schema";

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
  await requireAuth(request);
  const people = await getHiddenPeople();
  return { people };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const id = parseInt(formData.get("id") as string, 10);

  if (isNaN(id) && intent !== "undo-reject" && intent !== "bulk-reject") {
    return { error: "Invalid person ID" };
  }

  // Bulk reject by pattern match
  if (intent === "bulk-reject") {
    const patternInput = (formData.get("pattern") as string)?.trim();
    if (!patternInput) {
      return { error: "Pattern is required" };
    }

    // Split by comma or space and filter empty strings
    const patterns = patternInput
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((p) => p.length > 0);

    if (patterns.length === 0) {
      return { error: "Pattern is required" };
    }

    const allHidden = await getHiddenPeople();
    const toReject = allHidden.filter((p) => {
      // Search across all text fields
      const searchText = `${p.name} ${p.bio || ""} ${p.socialLinks || ""}`.toLowerCase();
      // Match if ALL patterns are found (so "Amsterdam, NL" requires both)
      return patterns.every((pattern) => searchText.includes(pattern));
    });

    let rejectedCount = 0;
    for (const person of toReject) {
      if (person.github) {
        await blockItem("github", person.github, person.name, `Bulk rejected: "${patternInput}"`);
      }
      await deletePerson(person.id);
      rejectedCount++;
    }

    return {
      success: true,
      action: "bulk-rejected",
      bulkRejectedCount: rejectedCount,
      pattern: patternInput,
    };
  }

  // Get person data for undo support (before any modifications)
  let personData: Person | null = null;
  if (intent === "approve" || intent === "reject") {
    personData = await getPersonById(id);
  }

  switch (intent) {
    case "approve": {
      await updatePerson(id, { visible: true });
      return {
        success: true,
        action: "approved",
        undoData: personData ? { id, previousVisible: false } : null,
      };
    }

    case "reject": {
      if (!personData) {
        return { error: "Person not found" };
      }

      // Add to blocklist if they have a GitHub profile
      if (personData.github) {
        await blockItem("github", personData.github, personData.name, "Rejected during review");
      }

      // Delete the person
      await deletePerson(id);

      return {
        success: true,
        action: "rejected",
        undoData: {
          ...personData,
          hasGithub: !!personData.github,
        },
      };
    }

    case "undo-approve": {
      await updatePerson(id, { visible: false });
      return { success: true, action: "undone" };
    }

    case "undo-reject": {
      // Recreate the person from the stored data
      const personJson = formData.get("personData") as string;

      if (!personJson) {
        return { error: "No person data for undo" };
      }

      const data = JSON.parse(personJson) as Person & { hasGithub?: boolean };

      // Remove from blocklist if they had a GitHub
      if (data.github) {
        await unblockItem("github", data.github);
      }

      // Recreate the person (without id/slug - they'll be regenerated)
      await createPerson({
        name: data.name,
        bio: data.bio,
        website: data.website,
        github: data.github,
        avatar: data.avatar,
        socialLinks: data.socialLinks,
        visible: false,
      });

      return { success: true, action: "undone" };
    }

    case "update": {
      const existingPerson = await getPersonById(id);
      if (!existingPerson) {
        return { error: "Person not found" };
      }

      const name = formData.get("name") as string;
      const bio = formData.get("bio") as string;
      const website = (formData.get("website") as string) || null;
      const github = (formData.get("github") as string) || null;
      const twitter = (formData.get("twitter") as string) || null;
      const linkedin = (formData.get("linkedin") as string) || null;
      const approveAfterSave = formData.get("approveAfterSave") === "on";

      if (!name) {
        return { error: "Name is required" };
      }

      // Process avatar
      let avatar: string | null | undefined = undefined;
      const avatarData = formData.get("avatarData") as string | null;
      const existingAvatar = formData.get("existingAvatar") as string | null;

      if (avatarData) {
        if (existingPerson.avatar) {
          await deleteImage(existingPerson.avatar);
        }
        const base64Data = avatarData.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        avatar = await processAndSaveIconImage(buffer);
      } else if (existingAvatar) {
        avatar = existingAvatar;
      } else if (existingPerson.avatar) {
        await deleteImage(existingPerson.avatar);
        avatar = null;
      }

      // Store twitter/linkedin in socialLinks
      const socialLinks: Record<string, string> = {};
      if (twitter) socialLinks.twitter = twitter;
      if (linkedin) socialLinks.linkedin = linkedin;

      await updatePerson(id, {
        name,
        bio,
        website,
        github,
        visible: approveAfterSave,
        socialLinks: Object.keys(socialLinks).length > 0 ? JSON.stringify(socialLinks) : null,
        ...(avatar !== undefined && { avatar }),
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
  personData?: Person & { hasGithub?: boolean };
}

export default function ReviewPeople() {
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

  // Parse social links for the current person
  const socialLinks: Record<string, string> = currentPerson?.socialLinks
    ? JSON.parse(currentPerson.socialLinks)
    : {};

  // Keep edit mode scoped to the current card.
  useEffect(() => {
    setEditMode(false);
  }, [currentPerson?.id]);

  // Optional preview: open the public person page as the current card changes.
  useEffect(() => {
    if (!openPersonPageInNewTab || !currentPerson?.slug) {
      return;
    }
    window.open(`/directory/people/${currentPerson.slug}`, "_blank", "noopener,noreferrer");
  }, [openPersonPageInNewTab, currentPerson?.id, currentPerson?.slug]);

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
  }, [currentPerson, editMode]);

  const advanceToNext = useCallback(() => {
    setPeople((prev) => {
      const newPeople = [...prev];
      newPeople.splice(currentIndex, 1);
      return newPeople;
    });
    // Index stays the same since we removed an item
  }, [currentIndex]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data?.success) {
      if (fetcher.data.action === "bulk-rejected") {
        // Reload to get fresh list after bulk reject
        setToastMessage(
          `Rejected ${fetcher.data.bulkRejectedCount} people matching "${fetcher.data.pattern}"`,
        );
        setTimeout(() => window.location.reload(), 1500);
      } else if (fetcher.data.action !== "undone" && fetcher.data.action !== "updated") {
        // Action completed, advance to next
        advanceToNext();
      }
    }
  }, [fetcher.data, advanceToNext]);

  const handleApprove = () => {
    if (!currentPerson) return;

    setLastAction({
      type: "approve",
      id: currentPerson.id,
      name: currentPerson.name,
    });
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

    setLastAction({
      type: "reject",
      id: currentPerson.id,
      name: currentPerson.name,
      personData: { ...currentPerson, hasGithub: !!currentPerson.github },
    });
    setToastMessage(
      `"${currentPerson.name}" rejected${currentPerson.github ? " and blocked" : ""}`,
    );

    fetcher.submit({ intent: "reject", id: currentPerson.id.toString() }, { method: "post" });
  };

  const handleUndo = () => {
    if (!lastAction) return;

    if (lastAction.type === "approve") {
      fetcher.submit({ intent: "undo-approve", id: lastAction.id.toString() }, { method: "post" });
      // Reload to get updated list
      window.location.reload();
    } else if (lastAction.type === "reject" && lastAction.personData) {
      fetcher.submit(
        {
          intent: "undo-reject",
          personData: JSON.stringify(lastAction.personData),
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
  if (people.length === 0 || !currentPerson) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-2xl mx-auto flex flex-col items-center justify-center gap-6 py-20">
          <div className="text-6xl">🎉</div>
          <h1 className="text-2xl font-semibold text-harbour-700">All caught up!</h1>
          <p className="text-harbour-500 text-center">
            There are no more people to review. Great work!
          </p>
          <Link
            to="/manage/people"
            className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors"
          >
            Back to People
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
            <Link to="/manage/people" className="text-sm text-harbour-400 hover:text-harbour-600">
              &larr; Back to People
            </Link>
            <h1 className="text-2xl font-semibold text-harbour-700 mt-1">Review People</h1>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-harbour-600">
              <input
                type="checkbox"
                checked={openPersonPageInNewTab}
                onChange={(e) => setOpenPersonPageInNewTab(e.target.checked)}
              />
              <span>Open person page in new tab</span>
            </label>
            <div className="text-sm text-harbour-500">{remaining} remaining</div>
          </div>
        </div>

        {/* Bulk Reject Tool */}
        <details className="border border-harbour-200 bg-harbour-50">
          <summary className="px-4 py-2 cursor-pointer text-sm font-medium text-harbour-600 hover:text-harbour-800">
            Bulk Reject Tool
          </summary>
          <div className="p-4 border-t border-harbour-200">
            <fetcher.Form method="post" className="flex gap-2">
              <input type="hidden" name="intent" value="bulk-reject" />
              <input
                type="text"
                name="pattern"
                placeholder="e.g. Eindhoven, Amsterdam, Netherlands..."
                className="flex-1 px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Reject Matching
              </button>
            </fetcher.Form>
            <p className="mt-2 text-xs text-harbour-500">
              This will reject all people whose name or bio contains the pattern (case-insensitive).
            </p>
          </div>
        </details>

        {/* Person Card */}
        <div className="bg-white border border-harbour-200 shadow-sm">
          {/* Card Header */}
          <div className="p-6 border-b border-harbour-100">
            <div className="flex gap-4">
              {currentPerson.avatar ? (
                <img
                  src={`/images/${currentPerson.avatar}`}
                  alt=""
                  className="w-16 h-16 object-cover rounded-full shrink-0"
                />
              ) : (
                <div className="w-16 h-16 bg-harbour-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-2xl text-harbour-400">{currentPerson.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-harbour-700 truncate">
                  {currentPerson.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-harbour-500">
                  {currentPerson.github && (
                    <a
                      href={currentPerson.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-harbour-700 flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                      </svg>
                      GitHub
                    </a>
                  )}
                  {currentPerson.website && (
                    <>
                      {currentPerson.github && <span>·</span>}
                      <a
                        href={ensureProtocol(currentPerson.website)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-harbour-700"
                      >
                        {getDisplayUrl(currentPerson.website)}
                      </a>
                    </>
                  )}
                  {socialLinks.twitter && (
                    <a
                      href={ensureProtocol(socialLinks.twitter)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-harbour-700"
                    >
                      Twitter
                    </a>
                  )}
                  {socialLinks.linkedin && (
                    <a
                      href={ensureProtocol(socialLinks.linkedin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-harbour-700"
                    >
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            </div>

            {currentPerson.bio && !editMode && (
              <p className="mt-4 text-sm text-harbour-600 line-clamp-3">{currentPerson.bio}</p>
            )}
          </div>

          {/* Edit Form (expandable) */}
          {editMode ? (
            <fetcher.Form
              key={currentPerson.id}
              method="post"
              className="p-6 bg-harbour-50 flex flex-col gap-4"
            >
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="id" value={currentPerson.id} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ImageUpload
                  label="Avatar"
                  name="avatarData"
                  existingName="existingAvatar"
                  aspect={1}
                  existingImage={currentPerson.avatar}
                  previewStyle="square"
                  helpText="1:1 ratio"
                />
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="name" className="text-sm font-medium text-harbour-700">
                      Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      defaultValue={currentPerson.name}
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
                      defaultValue={currentPerson.website ?? ""}
                      className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="bio" className="text-sm font-medium text-harbour-700">
                  Bio
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  rows={4}
                  defaultValue={currentPerson.bio ?? ""}
                  className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="github" className="text-sm font-medium text-harbour-700">
                    GitHub
                  </label>
                  <input
                    type="url"
                    id="github"
                    name="github"
                    placeholder="https://github.com/username"
                    defaultValue={currentPerson.github ?? ""}
                    className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="twitter" className="text-sm font-medium text-harbour-700">
                    Twitter
                  </label>
                  <input
                    type="url"
                    id="twitter"
                    name="twitter"
                    placeholder="https://twitter.com/username"
                    defaultValue={socialLinks.twitter ?? ""}
                    className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="linkedin" className="text-sm font-medium text-harbour-700">
                    LinkedIn
                  </label>
                  <input
                    type="url"
                    id="linkedin"
                    name="linkedin"
                    placeholder="https://linkedin.com/in/username"
                    defaultValue={socialLinks.linkedin ?? ""}
                    className="px-3 py-2 text-sm border border-harbour-300 focus:border-harbour-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end">
                <label className="flex items-center gap-2">
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
                disabled={fetcher.state !== "idle" || currentIndex >= people.length - 1}
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
