// =============================================================================
// Project Links helpers (shared between server and client)
// =============================================================================

export interface ProjectLinks {
  github?: string;
  itchio?: string;
  website?: string;
  demo?: string;
  npm?: string;
  pypi?: string;
  steam?: string;
  appstore?: string;
  playstore?: string;
  [key: string]: string | undefined;
}

export function parseProjectLinks(linksJson: string | null): ProjectLinks {
  if (!linksJson) return {};
  try {
    return JSON.parse(linksJson);
  } catch {
    return {};
  }
}

export function stringifyProjectLinks(links: ProjectLinks): string {
  // Remove empty values
  const cleaned = Object.fromEntries(
    Object.entries(links).filter(([_, v]) => v && v.trim())
  );
  return JSON.stringify(cleaned);
}
