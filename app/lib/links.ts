import { z } from "zod";

export const socialLinkKeys = [
  "twitter",
  "linkedin",
  "instagram",
  "youtube",
  "mastodon",
  "facebook",
] as const;
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
export type SocialLinks = Partial<Record<(typeof socialLinkKeys)[number], string>>;
export type ProjectLinks = Partial<Record<(typeof projectLinkKeys)[number], string>>;
export type LinkPatch<T> = { [K in keyof T]?: string | null } | null;
const linkUrl = z
  .string()
  .trim()
  .max(4096)
  .pipe(z.url({ protocol: /^https?$/ }));
function linkFields<const K extends readonly string[], V extends z.ZodType>(keys: K, value: V) {
  return Object.fromEntries(keys.map((key) => [key, value])) as { [P in K[number]]: V };
}
export const socialLinksOutput = z
  .object(linkFields(socialLinkKeys, linkUrl.optional()))
  .strict()
  .nullable();
export const projectLinksOutput = z
  .object(linkFields(projectLinkKeys, linkUrl.optional()))
  .strict()
  .nullable();
export const socialLinksPatch = z
  .object(linkFields(socialLinkKeys, linkUrl.nullable().optional()))
  .strict()
  .nullable();
export const projectLinksPatch = z
  .object(linkFields(projectLinkKeys, linkUrl.nullable().optional()))
  .strict()
  .nullable();
export function compactLinks<T>(links: LinkPatch<T>): T | null {
  const values = Object.fromEntries(
    Object.entries(links ?? {}).filter(([, value]) => value != null),
  );
  return Object.keys(values).length ? (values as T) : null;
}
