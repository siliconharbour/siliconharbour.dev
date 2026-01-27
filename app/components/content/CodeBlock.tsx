interface CodeBlockProps {
  children: string;
}

/**
 * Styled code block with harbour colors
 */
export function CodeBlock({ children }: CodeBlockProps) {
  return (
    <div className="not-prose">
      <pre className="p-3 bg-harbour-50 text-harbour-700 text-sm overflow-x-auto">{children}</pre>
    </div>
  );
}

/**
 * Inline code display
 */
export function Code({ children }: CodeBlockProps) {
  return (
    <div className="not-prose">
      <code className="block p-3 bg-harbour-50 text-harbour-700 text-sm">{children}</code>
    </div>
  );
}
