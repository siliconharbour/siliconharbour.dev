const SITE_URL = "https://siliconharbour.dev";
const SITE_NAME = "siliconharbour.dev";
const DEFAULT_OG_IMAGE = `${SITE_URL}/siliconharbour.svg`;

/**
 * Strip markdown syntax, wikilinks, and excess whitespace for use in meta descriptions.
 * Truncates to maxLength characters.
 */
export function stripMarkdown(text: string | null | undefined, maxLength = 155): string {
  if (!text) return "";
  return text
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1") // [[wikilinks]]
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links
    .replace(/#{1,6}\s+/g, "") // headings
    .replace(/[*_~`]{1,3}/g, "") // bold/italic/code
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .replace(/[.,;:!?]?\s*$/, "…");
}

export interface SeoMeta {
  title: string;
  description?: string;
  url: string;
  ogImage?: string;
  ogType?: string;
}

/**
 * Build a standard set of meta tags: title, description, canonical, OG, Twitter.
 */
export function buildSeoMeta({
  title,
  description,
  url,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
}: SeoMeta) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = url.startsWith("http") ? url : `${SITE_URL}${url}`;

  const tags: Record<string, string>[] = [
    { title: fullTitle },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:type", content: ogType },
    { property: "og:url", content: canonicalUrl },
    { property: "og:title", content: title },
    { property: "og:image", content: ogImage },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:image", content: ogImage },
  ];

  if (description) {
    tags.push(
      { name: "description", content: description },
      { property: "og:description", content: description },
      { name: "twitter:description", content: description },
    );
  }

  return tags;
}
