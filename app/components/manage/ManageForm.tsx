import type { ReactNode } from "react";
import { Alert, Button } from "~/components/ui";

export function ManageErrorAlert({ error }: { error: string }) {
  return <Alert tone="danger">{error}</Alert>;
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
    <Button type="submit" className="self-start">
      {children}
    </Button>
  );
}
