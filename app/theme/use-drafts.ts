import { useEffect, useLayoutEffect, useState } from "react";
import { DEFAULT_THEME } from "./tokens";
import {
  collectionSchema,
  DRAFT_STORAGE_KEY,
  draftContent,
  importShared,
  newDraft,
  type DraftCollection,
  type ThemeDraft,
} from "./drafts";
import type { SharedTheme } from "./share-config";

export function useDrafts(shared?: SharedTheme) {
  const [collection, setCollection] = useState<DraftCollection>(() => ({
    version: 1,
    active: "initial",
    items: [
      {
        id: "initial",
        name: shared?.name ?? "My theme",
        theme: shared?.theme ?? DEFAULT_THEME,
        logo: shared?.logo ?? null,
      },
    ],
  }));
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [restoreError, setRestoreError] = useState("");
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      let loaded = raw
        ? collectionSchema.parse(JSON.parse(raw))
        : {
            version: 1 as const,
            active: "initial",
            items: [{ id: "initial", name: "My theme", theme: DEFAULT_THEME, logo: null }],
          };
      if (!loaded.items.some((item) => item.id === loaded.active))
        loaded.active = loaded.items[0].id;
      if (shared) {
        try {
          loaded = importShared(loaded, shared);
        } catch (error) {
          setStorageError(error instanceof Error ? error.message : "Could not import this share.");
        }
      }
      setCollection(loaded);
    } catch {
      setRestoreError(
        "Saved themes could not be read. Choose New to start a fresh local collection. Your preview is still available.",
      );
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || restoreError) return;
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(collection));
      setStorageError("");
    } catch {
      setStorageError(
        "Browser storage is full or unavailable. Changes and editing access may be lost on reload. Remove a local theme to make room.",
      );
    }
  }, [collection, ready, restoreError]);
  const draft =
    collection.items.find((item) => item.id === collection.active) ?? collection.items[0];
  function change(patch: Partial<ThemeDraft>, id = draft.id) {
    setCollection((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }
  function add(copy = false) {
    setRestoreError("");
    const next = copy
      ? { ...newDraft(`Copy of ${draft.name}`.slice(0, 80)), theme: draft.theme, logo: draft.logo }
      : newDraft();
    setCollection((current) => ({ ...current, active: next.id, items: [...current.items, next] }));
  }
  function remove() {
    const remaining = collection.items.filter((item) => item.id !== draft.id);
    const items = remaining.length ? remaining : [newDraft()];
    setCollection({ version: 1, active: items[0].id, items });
  }
  function applyShared(share: SharedTheme) {
    try {
      setCollection(importShared(collection, share));
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Could not import this share.");
    }
  }
  function saved(share: SharedTheme, key: string | undefined, id: string, submitted: string) {
    change(
      {
        shareId: share.id,
        editKey: key ?? collection.items.find((item) => item.id === id)?.editKey,
        revision: share.revision,
        published: submitted,
      },
      id,
    );
  }
  return {
    draft,
    items: collection.items,
    ready,
    storageError: restoreError || storageError,
    change,
    add,
    remove,
    applyShared,
    saved,
    select: (id: string) =>
      setCollection((current) =>
        current.items.some((item) => item.id === id) ? { ...current, active: id } : current,
      ),
    dirty: draft.published !== draftContent(draft),
  };
}
