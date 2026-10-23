import { z } from "zod";

export function githubLogin(value: string): string {
  const trimmed = value.trim();
  const profile = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)\/?$/i.exec(trimmed);
  const login = (profile?.[1] ?? trimmed.replace(/^@/, "")).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(login))
    throw new Error(
      "Use a GitHub login, @login, github.com/login, or https://github.com/login; repository URLs and other hosts are not profiles.",
    );
  return login;
}
export function githubProfile() {
  return z
    .string()
    .trim()
    .max(4096)
    .transform((value, ctx) => {
      try {
        return `https://github.com/${githubLogin(value)}`;
      } catch (error) {
        ctx.addIssue({ code: "custom", message: (error as Error).message });
        return z.NEVER;
      }
    })
    .describe(
      "GitHub login, @login, or profile URL; stored as https://github.com/<lowercase-login>.",
    );
}
export function canonicalUrl() {
  return z
    .string()
    .trim()
    .max(4096)
    .transform((value) => (/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`))
    .pipe(z.url({ protocol: /^https?$/ }))
    .superRefine((value, ctx) => {
      const url = new URL(value);
      if (url.username || url.password)
        ctx.addIssue({ code: "custom", message: "URLs must not contain credentials" });
    })
    .transform((value) => {
      const url = new URL(value);
      return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`;
    });
}
export function email() {
  return z.string().trim().toLowerCase().pipe(z.email());
}
export function socialUrl(network: string) {
  return canonicalUrl().transform((value) => {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (network === "twitter" && ["twitter.com", "x.com"].includes(host)) {
      url.hostname = "x.com";
      url.pathname = url.pathname.toLowerCase().replace(/\/$/, "");
      return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`;
    }
    if (network === "linkedin" && host === "linkedin.com") return value.replace(/\/\/www\./, "//");
    return value;
  });
}
