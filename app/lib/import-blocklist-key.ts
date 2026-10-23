import { normalizeUrl } from "./directory-import";

export function normalizeBlockKey(source: string, value: string): string {
  const trimmed = value.trim();
  if (source === "github")
    return trimmed
      .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
      .replace(/^@/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  const candidate =
    /^[^\s/:]+\.[^\s/]+/.test(trimmed) && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;
  return normalizeUrl(candidate);
}
