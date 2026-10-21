interface CodeBlockProps {
  children: string;
}

/**
 * Styled code block with harbour colors
 */
export function CodeBlock({ children }: CodeBlockProps) {
  return (
    <div className="not-prose">
      <pre className="p-pad-3 bg-soft text-heading text-sm overflow-x-auto">{children}</pre>
    </div>
  );
}

/**
 * Inline code display
 */
export function Code({ children }: CodeBlockProps) {
  return (
    <div className="not-prose">
      <code className="block p-pad-3 bg-soft text-heading text-sm">{children}</code>
    </div>
  );
}
