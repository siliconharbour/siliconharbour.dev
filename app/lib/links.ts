import { githubProfile, socialUrl } from "./url-fields";
import { z } from "zod";

export const externalLinkKeys = [
  "github",
  "wikipedia",
  "twitter",
  "linkedin",
  "instagram",
  "youtube",
  "mastodon",
  "bluesky",
  "facebook",
] as const;
export const externalLinkLabels: Record<(typeof externalLinkKeys)[number], string> = {
  github: "GitHub",
  wikipedia: "Wikipedia",
  twitter: "Twitter",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  youtube: "YouTube",
  mastodon: "Mastodon",
  bluesky: "Bluesky",
  facebook: "Facebook",
};
export const projectLinkKeys = [
  "github",
  "itchio",
  "website",
  "demo",
  "npm",
  "pypi",
  "steam",
  "appstore",
  "playstore",
] as const;
export type ExternalLinks = Partial<Record<(typeof externalLinkKeys)[number], string>>;
export type ProjectLinks = Partial<Record<(typeof projectLinkKeys)[number], string>>;
export type LinkPatch<T> = { [K in keyof T]?: string | null } | null;
const linkUrl = z
  .string()
  .trim()
  .max(4096)
  .pipe(z.url({ protocol: /^https?$/ }));
function linkFields<const K extends readonly string[], V extends z.ZodType>(
  keys: K,
  field: (key: K[number]) => V,
) {
  return Object.fromEntries(keys.map((key) => [key, field(key)])) as { [P in K[number]]: V };
}
export const externalLinksOutput = z
  .object(linkFields(externalLinkKeys, () => linkUrl.optional()))
  .strict()
  .nullable();
export const projectLinksOutput = z
  .object(linkFields(projectLinkKeys, () => linkUrl.optional()))
  .strict()
  .nullable();
export const externalLinksPatch = z
  .object(
    linkFields(externalLinkKeys, (key) =>
      (key === "github" ? githubProfile() : socialUrl(key)).nullable().optional(),
    ),
  )
  .strict()
  .nullable();
export const projectLinksPatch = z
  .object(linkFields(projectLinkKeys, () => linkUrl.nullable().optional()))
  .strict()
  .nullable();
export function compactLinks<T>(links: LinkPatch<T>): T | null {
  const values = Object.fromEntries(
    Object.entries(links ?? {}).filter(([, value]) => value != null),
  );
  return Object.keys(values).length ? (values as T) : null;
}
