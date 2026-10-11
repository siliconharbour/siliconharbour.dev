import type { ReactNode } from "react";
import { Alert, Button } from "~/components/ui";

export function ManageErrorAlert({ error }: { error: string }) {
  return <Alert tone="danger">{error}</Alert>;
}

export function ManageForm({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-gap-6">{children}</div>;
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
    <div className="flex flex-col gap-gap-2">
      <label htmlFor={htmlFor} className="font-medium text-heading">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-subtle">{hint}</p> : null}
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
