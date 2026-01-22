/**
 * Content loading utilities for static markdown pages
 * Loads markdown files from app/content/ and parses frontmatter
 */

import { readFileSync } from "fs";
import { join } from "path";

export interface ContentPage {
  frontmatter: {
    title: string;
    description?: string;
    [key: string]: unknown;
  };
  content: string;
  raw: string;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = raw.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: {}, content: raw };
  }
  
  const [, frontmatterStr, content] = match;
  const frontmatter: Record<string, unknown> = {};
  
  // Simple YAML parser for key: value pairs
  for (const line of frontmatterStr.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }
  
  return { frontmatter, content: content.trim() };
}

/**
 * Load a content page by name
 * @param name - The content file name without extension (e.g., "about", "conduct")
 */
export function loadContentPage(name: string): ContentPage {
  // In production, content is bundled with the app
  // The path is relative to the app directory
  const contentDir = join(process.cwd(), "app", "content");
  const filePath = join(contentDir, `${name}.md`);
  
  const raw = readFileSync(filePath, "utf-8");
  const { frontmatter, content } = parseFrontmatter(raw);
  
  return {
    frontmatter: frontmatter as ContentPage["frontmatter"],
    content,
    raw,
  };
}

/**
 * Get the raw markdown content for API/LLM endpoints
 */
export function getRawContent(name: string): string {
  const page = loadContentPage(name);
  return page.raw;
}
