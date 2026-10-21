import type { ReactNode } from "react";

function ResetButton({ label, onReset }: { label: string; onReset: () => void }) {
  return (
    <button
      type="button"
      className="theme-section-reset"
      aria-label={`Reset ${label.toLowerCase()}`}
      title={`Reset ${label.toLowerCase()}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onReset();
      }}
    >
      <span aria-hidden="true">↺</span>
    </button>
  );
}

export function EditorSection({
  title,
  onReset,
  children,
  defaultOpen = true,
}: {
  title: string;
  onReset: () => void;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="theme-details" open={defaultOpen}>
      <summary>
        {title}
        <ResetButton label={title} onReset={onReset} />
      </summary>
      {children}
    </details>
  );
}
