import { useState } from "react";
import { useTheme } from "./provider";
import { draftContent } from "./drafts";
import type { SharedTheme } from "./share-config";

export function DraftControls() {
  const { drafts, cancelLogoUpload } = useTheme();
  function switchDraft(action: () => void) {
    cancelLogoUpload();
    action();
  }
  return (
    <details className="theme-details theme-drafts">
      <summary>Themes</summary>
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
            </option>
          ))}
        </select>
      </label>
      <label className="theme-field">
        Theme name
        <input
          aria-label="Theme name"
          key={`${drafts.draft.id}:${drafts.draft.name}`}
          defaultValue={drafts.draft.name}
          maxLength={80}
          onBlur={(event) =>
            drafts.change({ name: event.currentTarget.value.trim() || "Untitled theme" })
          }
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
          Duplicate
        </button>
        <button
          type="button"
          className="theme-small-button"
          onClick={() => switchDraft(drafts.remove)}
        >
          Remove local
        </button>
      </div>
    </details>
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
      setResult({ id, message: "Link copied." });
    } catch {
      setResult({ id, link, message: "Copy this link." });
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
        message: "Could not share. Try again.",
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
      drafts.change(
        {
          name: share.name,
          theme: share.theme,
          logo: share.logo,
          revision: share.revision,
          published: draftContent(share),
        },
        draft.id,
      );
      setResult(undefined);
    } catch {
      setResult({
        id: draft.id,
        message: "The saved share could not be loaded. Duplicate to save a new link.",
      });
    }
  }
  const ownsShare = !!draft.editKey && !!draft.shareId;
  const label = ownsShare ? (drafts.dirty ? "Update link" : "Copy link") : "Share";
  return (
    <>
      <button
        type="button"
        className="theme-share"
        disabled={busy || !drafts.ready || logoLoading || !!drafts.storageError}
        onClick={save}
      >
        {busy ? "Saving…" : label}
      </button>
      {current && (
        <p className="theme-status" role="status">
          {current.message}
        </p>
      )}
      {current?.conflict && (
        <button className="theme-small-button" type="button" onClick={reloadShare}>
          Load saved version
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
      <details className="theme-share-info">
        <summary>About sharing</summary>
        <p>
          A link shares this theme and logo publicly. Changes stay local until you update the link.
        </p>
      </details>
    </>
  );
}
