/**
 * Shared text normalization for job importers.
 *
 * Goal:
 * - preserve meaningful line breaks for UI display
 * - collapse only excessive whitespace
 */

/**
 * Normalize plain text while keeping paragraph/list line breaks.
 */
export function normalizeTextForDisplay(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(text: string): string {
  const namedEntityMap: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
    ndash: "-",
    mdash: "-",
    hellip: "...",
  };

  return text
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (_, entity: string) => {
      const normalized = entity.toLowerCase();
      return namedEntityMap[normalized] ?? `&${entity};`;
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      if (!Number.isFinite(codePoint)) return _;
      return String.fromCodePoint(codePoint);
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      if (!Number.isFinite(codePoint)) return _;
      return String.fromCodePoint(codePoint);
    });
}

/**
 * Convert HTML to plain text while preserving block-level breaks.
 */
export function htmlToText(html: string): string {
  // Decode first so encoded tags like &lt;p&gt; are handled as HTML.
  const decodedHtml = decodeHtmlEntities(html);

  const withBreaks = decodedHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|section|article|header|footer|aside|main|h1|h2|h3|h4|h5|h6|ul|ol|li|blockquote|pre|table|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "");

  // Decode one more time in case inner chunks were double-encoded.
  const decodedText = decodeHtmlEntities(withBreaks);

  return normalizeTextForDisplay(decodedText);
}
