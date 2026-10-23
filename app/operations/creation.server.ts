import { normalizeUrl } from "~/lib/directory-import";
import { createHash } from "node:crypto";
import { InvalidOperationError } from "./errors";
import { toPlain, type Plain } from "./plain";
import { canonicalUrl, githubProfile } from "~/lib/url-fields";

interface CreationIdentity<T> {
  key: string | null;
  find(): Promise<T | null>;
}
const identityUrlSchema = canonicalUrl();
const identityGithubSchema = githubProfile();
const pendingCreations = new Map<string, Promise<void>>();
export async function createIfAbsent<T extends object>(
  identityScope: string,
  ifNotExists: boolean | undefined,
  identity: CreationIdentity<T>,
  create: () => Promise<T>,
): Promise<T & { created: boolean }> {
  if (!ifNotExists) return { ...(await create()), created: true };
  if (!identity.key)
    throw new InvalidOperationError(
      "ifNotExists requires the stable identity described by this operation",
    );
  const key = JSON.stringify([identityScope, identity.key]);
  while (pendingCreations.has(key)) await pendingCreations.get(key);
  let release!: () => void;
  pendingCreations.set(
    key,
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  try {
    const existing = await identity.find();
    return existing ? { ...existing, created: false } : { ...(await create()), created: true };
  } finally {
    pendingCreations.delete(key);
    release();
  }
}
export function recordIdentity<T extends object>(
  key: string | null,
  rows: () => Promise<readonly T[]>,
  matches: (row: T) => boolean,
): CreationIdentity<Plain<T>> {
  return {
    key,
    find: async () => {
      const row = (await rows()).find(matches);
      return row ? toPlain(row) : null;
    },
  };
}
export function normalizeIdentityUrl(value: string | null | undefined): string | null {
  const parsed = identityUrlSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function normalizeGithubIdentity(value: string | null | undefined): string | null {
  const parsed = identityGithubSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function urlIdentity<T extends object>(
  value: string | null | undefined,
  rows: () => Promise<readonly T[]>,
  getUrl: (row: T) => string | null | undefined,
  normalize = normalizeIdentityUrl,
): CreationIdentity<Plain<T>> {
  const key = normalize(value);
  return recordIdentity(key, rows, (row) => key !== null && normalize(getUrl(row)) === key);
}

export function identityKey(...parts: Array<string | number | boolean | null | undefined>) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function normalizeDirectoryIdentity(value: string | null | undefined): string | null {
  const url = normalizeIdentityUrl(value);
  return url ? normalizeUrl(url) : null;
}
