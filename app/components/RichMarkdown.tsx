import { Link } from "react-router";
import Markdown from "react-markdown";
import type { ContentType } from "~/db/schema";

// =============================================================================
// Types
// =============================================================================

export interface ResolvedRef {
  text: string;
  type: ContentType;
  slug: string;
  name: string;
}

interface RichMarkdownProps {
  content: string;
  resolvedRefs?: Record<string, ResolvedRef>;
  className?: string;
}

// =============================================================================
// URL helpers (duplicated from server to avoid import issues)
// =============================================================================

const contentTypeRoutes: Record<ContentType, string> = {
  event: "/events",
  company: "/companies",
  group: "/groups",
  learning: "/learning",
  person: "/people",
  news: "/news",
  job: "/jobs",
  project: "/projects",
};

function getContentUrl(type: ContentType, slug: string): string {
  return `${contentTypeRoutes[type]}/${slug}`;
}

// =============================================================================
// Reference link processing
// =============================================================================

const REFERENCE_REGEX = /\[\[([^\]]+)\]\]/g;

/**
 * Pre-process markdown to convert [[references]] to links
 * Resolved refs become real links, unresolved ones stay as styled text
 */
function processReferences(
  content: string, 
  resolvedRefs?: Record<string, ResolvedRef>
): string {
  return content.replace(REFERENCE_REGEX, (match, text) => {
    const trimmed = text.trim();
    const resolved = resolvedRefs?.[trimmed];
    
    if (resolved) {
      const url = getContentUrl(resolved.type, resolved.slug);
      // Use markdown link syntax so react-markdown can handle it
      return `[${resolved.name}](${url})`;
    }
    
    // Unresolved - keep the text but mark it
    return `**${trimmed}**`;
  });
}

// =============================================================================
// Component
// =============================================================================

/**
 * Renders markdown content with [[reference]] support
 * 
 * Usage:
 * - Pass content with [[Entity Name]] references
 * - Pass resolvedRefs object from server loader (use prepareRefsForClient)
 * - Resolved refs become clickable links
 * - Unresolved refs show as bold text
 */
export function RichMarkdown({ content, resolvedRefs, className }: RichMarkdownProps) {
  const processedContent = processReferences(content, resolvedRefs);
  
  return (
    <div className={`prose prose-sm max-w-none ${className ?? ""}`}>
      <Markdown
        components={{
          // Override link rendering to use React Router Link for internal links
          a: ({ href, children, ...props }) => {
            if (href?.startsWith("/")) {
              return (
                <Link to={href} {...props}>
                  {children}
                </Link>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {processedContent}
      </Markdown>
    </div>
  );
}
