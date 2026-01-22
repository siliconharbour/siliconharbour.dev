/**
 * Content loading utilities for static markdown/MDX pages
 * 
 * MDX files are used for rich HTML rendering with React components.
 * We also extract plain markdown for the .md API endpoints.
 */

import { readFileSync, existsSync } from "fs";
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
 * Parse YAML frontmatter from markdown/MDX content
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
 * Strip MDX-specific syntax to get plain markdown
 * - Removes import statements
 * - Converts JSX components to markdown equivalents or removes them
 */
function mdxToMarkdown(content: string): string {
  // Remove import statements
  let markdown = content.replace(/^import\s+.*?;?\s*$/gm, "");
  
  // Convert <ObfuscatedEmail /> to plain text
  markdown = markdown.replace(/<ObfuscatedEmail\s*\/>/g, "admin [at] siliconharbour [dot] dev");
  
  // Convert <Callout type="warning">...</Callout> to blockquote
  markdown = markdown.replace(
    /<Callout[^>]*type="warning"[^>]*>([\s\S]*?)<\/Callout>/g,
    "> **Warning:** $1"
  );
  markdown = markdown.replace(
    /<Callout[^>]*>([\s\S]*?)<\/Callout>/g,
    "> $1"
  );
  
  // Convert <Code>...</Code> to inline code block
  markdown = markdown.replace(/<Code>([\s\S]*?)<\/Code>/g, "```\n$1\n```");
  
  // Convert <CodeBlock>{`...`}</CodeBlock> to fenced code block
  markdown = markdown.replace(/<CodeBlock>\{`([\s\S]*?)`\}<\/CodeBlock>/g, "```\n$1\n```");
  
  // Convert <ApiTable /> to the markdown table (hardcoded for now)
  const apiTableMarkdown = `| Endpoint | Description |
|----------|-------------|
| \`GET /api/companies\` | List companies |
| \`GET /api/companies/:slug\` | Get company |
| \`GET /api/events\` | List events |
| \`GET /api/events/:slug\` | Get event |
| \`GET /api/groups\` | List groups |
| \`GET /api/groups/:slug\` | Get group |
| \`GET /api/jobs\` | List jobs |
| \`GET /api/jobs/:slug\` | Get job |
| \`GET /api/education\` | List education |
| \`GET /api/education/:slug\` | Get education |
| \`GET /api/news\` | List news |
| \`GET /api/news/:slug\` | Get news article |
| \`GET /api/people\` | List people |
| \`GET /api/people/:slug\` | Get person |
| \`GET /api/projects\` | List projects |
| \`GET /api/projects/:slug\` | Get project |
| \`GET /api/products\` | List products |
| \`GET /api/products/:slug\` | Get product |`;
  markdown = markdown.replace(/<ApiTable\s*\/>/g, apiTableMarkdown);
  
  // Clean up extra blank lines
  markdown = markdown.replace(/\n{3,}/g, "\n\n");
  
  return markdown.trim();
}

/**
 * Load a content page by name (prefers .mdx, falls back to .md)
 * @param name - The content file name without extension (e.g., "about", "conduct")
 */
export function loadContentPage(name: string): ContentPage {
  const contentDir = join(process.cwd(), "app", "content");
  
  // Try .mdx first, then .md
  let filePath = join(contentDir, `${name}.mdx`);
  let isMdx = true;
  
  if (!existsSync(filePath)) {
    filePath = join(contentDir, `${name}.md`);
    isMdx = false;
  }
  
  const raw = readFileSync(filePath, "utf-8");
  const { frontmatter, content } = parseFrontmatter(raw);
  
  return {
    frontmatter: frontmatter as ContentPage["frontmatter"],
    content: isMdx ? mdxToMarkdown(content) : content,
    raw: isMdx ? rebuildRawMarkdown(frontmatter, mdxToMarkdown(content)) : raw,
  };
}

/**
 * Rebuild raw markdown with frontmatter for .md endpoints
 */
function rebuildRawMarkdown(frontmatter: Record<string, unknown>, content: string): string {
  const frontmatterLines = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  
  return `---\n${frontmatterLines}\n---\n\n${content}`;
}

/**
 * Get the raw markdown content for API/LLM endpoints
 */
export function getRawContent(name: string): string {
  const page = loadContentPage(name);
  return page.raw;
}
