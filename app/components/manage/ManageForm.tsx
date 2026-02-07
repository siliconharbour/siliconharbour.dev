import type { ReactNode } from "react";

export function ManageErrorAlert({ error }: { error: string }) {
  return <div className="p-4 bg-red-50 border border-red-200 text-red-600">{error}</div>;
}

export function ManageForm({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}

export function ManageField({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="font-medium text-harbour-700">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-harbour-400">{hint}</p> : null}
    </div>
  );
}

export function ManageSubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="px-4 py-2 bg-harbour-600 hover:bg-harbour-700 text-white font-medium transition-colors self-start"
    >
      {children}
    </button>
  );
}
