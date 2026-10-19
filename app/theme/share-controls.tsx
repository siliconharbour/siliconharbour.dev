import { useEffect, useState } from "react";
import { useTheme } from "./provider";
import { draftContent } from "./drafts";
import type { SharedTheme } from "./share-config";

export function DraftControls() {
  const { drafts, cancelLogoUpload } = useTheme();
  const [name, setName] = useState(drafts.draft.name);
  useEffect(() => setName(drafts.draft.name), [drafts.draft.id, drafts.draft.name]);
  function switchDraft(action: () => void) {
    cancelLogoUpload();
    action();
  }
  return (
    <section className="theme-control-section" aria-label="Local theme collection">
      <label className="theme-field">
        My themes
        <select
          aria-label="My themes"
          value={drafts.draft.id}
          onChange={(event) => switchDraft(() => drafts.select(event.target.value))}
          disabled={!drafts.ready}
        >
          {drafts.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.editKey ? " (owned share)" : item.shareId ? " (shared)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="theme-field">
        Theme name
        <input
          aria-label="Theme name"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => drafts.change({ name: name.trim() || "Untitled theme" })}
        />
      </label>
      <div className="theme-draft-actions">
        <button
          type="button"
          className="theme-small-button"
          onClick={() => switchDraft(() => drafts.add())}
        >
          New
        </button>
        <button
          type="button"
          className="theme-small-button"
          onClick={() => switchDraft(() => drafts.add(true))}
        >
          Make a copy
        </button>
        <button
          type="button"
          className="theme-small-button"
          onClick={() => switchDraft(drafts.remove)}
        >
          Remove local
        </button>
      </div>
      <p className="theme-help">
        Drafts and edit keys live in this browser. Removing a theme removes its editing access; the
        shared link stays online.
      </p>
    </section>
  );
}
export function ShareControls() {
  const { drafts, logoLoading, cancelLogoUpload } = useTheme();
  const { draft } = drafts;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    id: string;
    link?: string;
    message: string;
    conflict?: boolean;
  }>();
  const current = result?.id === draft.id ? result : undefined;
  async function copy(link: string, id: string) {
    try {
      await navigator.clipboard.writeText(link);
      setResult({ id, link, message: "Link copied, including the logo." });
    } catch {
      setResult({ id, link, message: "Share saved. Copy the link below." });
    }
  }
  async function save() {
    const submitted = draftContent(draft);
    if (draft.editKey && draft.shareId && !drafts.dirty)
      return copy(new URL(`/design/share/${draft.shareId}`, window.location.origin).href, draft.id);
    setBusy(true);
    setResult(undefined);
    try {
      const update = !!draft.editKey && !!draft.shareId;
      const response = await fetch(
        update ? `/api/theme-shares/${draft.shareId}` : "/api/theme-shares",
        {
          method: update ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...(update ? { "X-Theme-Edit-Key": draft.editKey! } : {}),
          },
          body: JSON.stringify({
            name: draft.name,
            theme: draft.theme,
            logo: draft.logo,
            ...(update ? { revision: draft.revision } : {}),
          }),
        },
      );
      if (!response.ok) {
        setResult({
          id: draft.id,
          message: await response.text(),
          conflict: response.status === 409,
        });
        return;
      }
      const saved: { share: SharedTheme; editKey?: string } = await response.json();
      drafts.saved(saved.share, saved.editKey, draft.id, submitted);
      await copy(new URL(`/design/share/${saved.share.id}`, window.location.origin).href, draft.id);
    } catch {
      setResult({
        id: draft.id,
        message: "The share could not be saved. Your local draft is unchanged. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function reloadShare() {
    if (!draft.shareId) return;
    try {
      const response = await fetch(`/api/theme-shares/${draft.shareId}`);
      if (!response.ok) throw new Error();
      const share: SharedTheme = await response.json();
      cancelLogoUpload();
      drafts.change({
        name: share.name,
        theme: share.theme,
        logo: share.logo,
        revision: share.revision,
        published: draftContent(share),
      });
      setResult(undefined);
    } catch {
      setResult({
        id: draft.id,
        message: "The saved share could not be loaded. Make a copy to save a new link.",
      });
    }
  }
  const label = draft.editKey
    ? drafts.dirty
      ? "Update shared theme"
      : "Copy share link"
    : draft.shareId
      ? "Create own share"
      : "Create share link";
  return (
    <>
      <button
        type="button"
        className="theme-share"
        disabled={busy || !drafts.ready || logoLoading || !!drafts.storageError}
        onClick={save}
      >
        {busy ? "Saving share…" : label}
      </button>
      <p className="theme-status" role="status">
        {current?.message ??
          (draft.editKey
            ? "This browser can update this link. Edits stay local until you publish them."
            : "Sharing uploads this theme and its logo. Anyone with the link can view it.")}
      </p>
      {current?.conflict && (
        <button className="theme-small-button" type="button" onClick={reloadShare}>
          Replace local edits with saved share
        </button>
      )}
      {current?.link && (
        <label className="theme-field">
          Share link
          <textarea
            aria-label="Share link"
            value={current.link}
            readOnly
            rows={2}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      {drafts.storageError && (
        <p className="theme-notice">
          Free browser storage before sharing so editing access can be saved.
        </p>
      )}
      <p className="theme-help">
        Clearing browser storage removes editing access. You can always make a new copy.
      </p>
    </>
  );
}
