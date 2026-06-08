/**
 * Focus FS custom scraper
 *
 * Focus FS rebuilt their careers page on Next.js. Job postings live inside
 * a `<section class="image-strip">` and each card is rendered statically as
 * an `<article class="image-strip-card">` with a sector/location line, an
 * `<h3>` title, and a short subtitle.
 *
 * The full role descriptions (Role Summary, Key Responsibilities, etc.) are
 * NOT in the prerendered HTML — they live as a `let r=[{...}]` array inside
 * one of the `/_next/static/chunks/*.js` bundles. The page injects each
 * entry's markdown description into a single `#open-content-text` panel
 * when a card is clicked.
 *
 * Strategy:
 *   1. Fetch /careers and pull out every `<script src="/_next/static/chunks/...">`.
 *   2. Fetch chunks in parallel, find the one that contains the careers
 *      data array (identified by a known sentinel title), then extract the
 *      array literal with bracket matching and evaluate it with `new Function`.
 *   3. Map each entry to a FetchedJob. Render the markdown description to
 *      simple HTML with an inline converter (the markdown they ship only
 *      uses ## headings, **bold**, paragraphs, and `-` unordered lists).
 *   4. If chunk extraction fails (e.g. they restructure their bundles),
 *      fall back to scraping the card grid from the prerendered HTML.
 *      The fallback yields the title, sector, location, and short subtitle
 *      but no rich description.
 */

import type { FetchedJob, WorkplaceType } from "../types";
import {
  fetchPage,
  htmlToText,
  slugify,
  parseHtmlDocument,
  getNodeText,
} from "./utils";

const CAREERS_URL = "https://focusfs.com/careers";
const ORIGIN = "https://focusfs.com";

// A title that's currently present on the careers page. Used to fingerprint
// the right JS chunk when scanning bundles. If Focus FS removes every role
// matching any of these sentinels we'll fall back to the HTML scrape path.
const CHUNK_SENTINELS = [
  "Industrial Mid-Market Account Executive",
  "Full Stack Developer",
  "AI Engineer",
];

interface RawRole {
  id: string;
  icon?: string;
  sector?: string;
  title: string;
  subtitle?: string;
  description?: string;
}

export async function scrapeFocusfs(): Promise<FetchedJob[]> {
  const html = await fetchPage(CAREERS_URL);

  const roles = await tryExtractRolesFromChunks(html);
  if (roles.length > 0) {
    return roles.map(buildJobFromRole);
  }

  // Fallback: parse the static card grid. Loses the rich descriptions but
  // we still surface the role and short subtitle so the listing isn't empty.
  return parseCardGrid(html);
}

/**
 * Walks the Next.js bundles linked from the page and tries to pull out the
 * roles array embedded as `let r=[{...}]`.
 */
async function tryExtractRolesFromChunks(html: string): Promise<RawRole[]> {
  const chunkUrls = extractChunkUrls(html);
  if (chunkUrls.length === 0) return [];

  // Fetch chunks in parallel. Skip individual failures — we only need the
  // one that holds the careers payload.
  const chunkBodies = await Promise.all(
    chunkUrls.map(async (url) => {
      try {
        return await fetchPage(url);
      } catch {
        return "";
      }
    }),
  );

  for (const body of chunkBodies) {
    if (!body) continue;
    if (!CHUNK_SENTINELS.some((sentinel) => body.includes(sentinel))) continue;
    const roles = extractRolesFromChunk(body);
    if (roles.length > 0) return roles;
  }

  return [];
}

function extractChunkUrls(html: string): string[] {
  const urls = new Set<string>();
  const regex = /<script[^>]+src=["']([^"']*\/_next\/static\/chunks\/[^"']+\.js)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const src = match[1];
    urls.add(src.startsWith("http") ? src : `${ORIGIN}${src}`);
  }
  return Array.from(urls);
}

function extractRolesFromChunk(code: string): RawRole[] {
  // Find an array literal whose first object has an `id:` followed shortly
  // by a `title:` containing one of our sentinel role titles. This avoids
  // misfiring on unrelated arrays elsewhere in the bundle.
  const arrayStarts = findAllArrayLiteralStarts(code);
  for (const start of arrayStarts) {
    const end = findMatchingClose(code, start);
    if (end < 0) continue;
    const arrStr = code.slice(start, end + 1);
    if (!CHUNK_SENTINELS.some((sentinel) => arrStr.includes(sentinel))) continue;

    try {
      // Safe-ish eval: the slice contains nothing but an array literal with
      // string/template literal values from the same origin's static bundle.
      const result = new Function(`return ${arrStr};`)() as unknown;
      if (Array.isArray(result) && result.every(isRawRole)) {
        return result as RawRole[];
      }
    } catch {
      // ignore and keep searching
    }
  }
  return [];
}

/**
 * Find every `[{` position in the code. These are candidate array literals.
 */
function findAllArrayLiteralStarts(code: string): number[] {
  const starts: number[] = [];
  for (let i = 0; i < code.length - 1; i++) {
    if (code[i] === "[" && code[i + 1] === "{") {
      starts.push(i);
    }
  }
  return starts;
}

/**
 * Given an index pointing at a `[`, find the matching `]`. Handles nested
 * brackets/braces/parens and skips over strings (including template literals
 * with `${...}` interpolations) and regexes well enough for static data.
 */
function findMatchingClose(code: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < code.length) {
    const ch = code[i];

    // String literals
    if (ch === '"' || ch === "'") {
      i = skipString(code, i, ch);
      continue;
    }
    if (ch === "`") {
      i = skipTemplate(code, i);
      continue;
    }

    if (ch === "[" || ch === "{" || ch === "(") depth++;
    else if (ch === "]" || ch === "}" || ch === ")") {
      depth--;
      if (depth === 0 && ch === "]") return i;
      if (depth < 0) return -1;
    }
    i++;
  }
  return -1;
}

function skipString(code: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i++;
  }
  return i;
}

function skipTemplate(code: string, start: number): number {
  let i = start + 1;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") return i + 1;
    if (ch === "$" && code[i + 1] === "{") {
      // Skip the interpolated expression by tracking braces.
      let depth = 1;
      i += 2;
      while (i < code.length && depth > 0) {
        const c2 = code[i];
        if (c2 === '"' || c2 === "'") {
          i = skipString(code, i, c2);
          continue;
        }
        if (c2 === "`") {
          i = skipTemplate(code, i);
          continue;
        }
        if (c2 === "{") depth++;
        else if (c2 === "}") depth--;
        i++;
      }
      continue;
    }
    i++;
  }
  return i;
}

function isRawRole(value: unknown): value is RawRole {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.title === "string";
}

function buildJobFromRole(role: RawRole): FetchedJob {
  const { department, location, workplaceType } = parseSector(role.sector);
  const descriptionHtml = role.description
    ? renderMarkdownToHtml(role.description)
    : undefined;
  const subtitleText = role.subtitle?.trim();
  const bodyText = descriptionHtml ? htmlToText(descriptionHtml).trim() : "";
  const combinedText = [subtitleText, bodyText].filter(Boolean).join("\n\n");

  return {
    externalId: role.id || slugify(role.title),
    title: role.title.trim(),
    location: location || "St. John's, NL",
    department,
    workplaceType,
    descriptionHtml: descriptionHtml
      ? subtitleText
        ? `<p>${escapeHtml(subtitleText)}</p>\n${descriptionHtml}`
        : descriptionHtml
      : subtitleText
        ? `<p>${escapeHtml(subtitleText)}</p>`
        : undefined,
    descriptionText: combinedText || undefined,
    url: CAREERS_URL,
  };
}

/**
 * Sector strings look like "Software · St. John's, NL" or
 * "Business Development · Flexible". Split on the bullet to extract a
 * department and a location, and infer workplaceType where possible.
 */
function parseSector(sector?: string): {
  department?: string;
  location?: string;
  workplaceType?: WorkplaceType;
} {
  if (!sector) return {};
  const parts = sector.split(/\s*[·•]\s*/).map((part) => part.trim()).filter(Boolean);
  const department = parts[0];
  const locationRaw = parts.slice(1).join(" · ");
  if (!locationRaw) return { department };

  const lower = locationRaw.toLowerCase();
  let workplaceType: WorkplaceType | undefined;
  let location: string | undefined = locationRaw;

  if (lower === "remote" || lower.startsWith("remote")) {
    workplaceType = "remote";
  } else if (lower === "flexible" || lower.includes("hybrid")) {
    // "Flexible" on Focus FS roles maps to hybrid in practice — the role
    // is open to candidates who aren't co-located with the St. John's HQ.
    workplaceType = "hybrid";
    location = "Flexible";
  } else if (lower.includes("st. john")) {
    workplaceType = "onsite";
    // Normalize to a consistent format if they wrote "St. John's" alone.
    if (!/,/.test(location)) {
      location = "St. John's, NL";
    }
  }

  return { department, location, workplaceType };
}

/**
 * Minimal markdown -> HTML converter that handles the patterns Focus FS
 * actually uses in their role descriptions: `## headings`, paragraphs,
 * `**bold**`, and `- `/`* ` unordered lists. We intentionally keep this
 * tiny rather than pulling in a markdown dependency for one scraper.
 */
function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  let listOpen = false;
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(" ").trim();
    if (text) {
      out.push(`<p>${renderInline(text)}</p>`);
    }
    paragraphBuffer = [];
  };

  const closeList = () => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length + 1, 6); // ## -> h3, etc.
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    const listItem = /^[-*]\s+(.*)$/.exec(line);
    if (listItem) {
      flushParagraph();
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${renderInline(listItem[1].trim())}</li>`);
      continue;
    }

    paragraphBuffer.push(line.trim());
  }

  flushParagraph();
  closeList();

  return out.join("\n");
}

function renderInline(text: string): string {
  // Escape first so we can safely inject our own `<strong>` tags afterwards.
  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Fallback: pull the basic card information from the prerendered HTML when
 * we can't find the chunk holding the rich descriptions.
 */
function parseCardGrid(html: string): FetchedJob[] {
  const document = parseHtmlDocument(html);
  const cards = Array.from(document.querySelectorAll("article.image-strip-card"));
  const jobs: FetchedJob[] = [];

  for (const card of cards) {
    const titleEl = card.querySelector("h3");
    const title = getNodeText(titleEl);
    if (!title) continue;

    const sector = getNodeText(card.querySelector(".image-strip-sector"));
    const subtitle = getNodeText(card.querySelector(".image-strip-subtitle"));

    const { department, location, workplaceType } = parseSector(sector);

    jobs.push({
      externalId: slugify(title),
      title,
      location: location || "St. John's, NL",
      department,
      workplaceType,
      descriptionHtml: subtitle ? `<p>${escapeHtml(subtitle)}</p>` : undefined,
      descriptionText: subtitle || undefined,
      url: CAREERS_URL,
    });
  }

  return jobs;
}
