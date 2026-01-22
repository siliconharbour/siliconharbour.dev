import { Link } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
}

/**
 * Markdown component with GFM (GitHub Flavored Markdown) support
 * Renders tables, strikethrough, autolinks, task lists, etc.
 */
export function Markdown({ children }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
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
      {children}
    </ReactMarkdown>
  );
}
