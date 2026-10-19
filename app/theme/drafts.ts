import { z } from "zod";
import { DEFAULT_THEME, themeSchema } from "./tokens";
import { logoSchema, type SharedTheme } from "./share-config";

export const DRAFT_STORAGE_KEY = "siliconharbour:themes:v1";
export const draftSchema = z
  .object({
    id: z.string().max(80),
    name: z.string().trim().min(1).max(80),
    theme: themeSchema,
    logo: logoSchema.nullable(),
    shareId: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    editKey: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    revision: z.number().int().positive().optional(),
    published: z.string().optional(),
  })
  .strict();
export type ThemeDraft = z.infer<typeof draftSchema>;
export const collectionSchema = z
  .object({ version: z.literal(1), active: z.string(), items: z.array(draftSchema).min(1) })
  .strict();
export type DraftCollection = z.infer<typeof collectionSchema>;
export function newDraft(name = "Untitled theme"): ThemeDraft {
  return { id: crypto.randomUUID(), name, theme: { ...DEFAULT_THEME }, logo: null };
}
export function draftContent(draft: Pick<ThemeDraft, "name" | "theme" | "logo">) {
  return JSON.stringify({
    name: draft.name,
    theme: draft.theme,
    logo: draft.logo
      ? {
          hash: draft.logo.hash,
          name: draft.logo.name,
          width: draft.logo.width,
          height: draft.logo.height,
        }
      : null,
  });
}
export function importShared(collection: DraftCollection, share: SharedTheme): DraftCollection {
  const existing = collection.items.find((item) => item.shareId === share.id);
  // Keep this browser's unpublished edits when reopening a share it owns.
  if (existing?.editKey) return { ...collection, active: existing.id };
  const draft: ThemeDraft = {
    id: existing?.id ?? crypto.randomUUID(),
    name: share.name,
    theme: share.theme,
    logo: share.logo,
    shareId: share.id,
    revision: share.revision,
  };
  return {
    ...collection,
    active: draft.id,
    items: [...collection.items.filter((item) => item.id !== draft.id), draft],
  };
}
