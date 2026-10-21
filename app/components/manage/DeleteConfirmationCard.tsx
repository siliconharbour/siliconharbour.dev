import type { ReactNode } from "react";

interface DeleteConfirmationCardProps {
  title: string;
  message: ReactNode;
  children: ReactNode;
}

export function DeleteConfirmationCard({ title, message, children }: DeleteConfirmationCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-pad-6">
      <div className="max-w-md w-full bg-surface border border-line p-pad-6 flex flex-col gap-gap-6 rounded-panel">
        <h1 className="text-xl font-semibold text-heading">{title}</h1>
        <p className="text-muted">{message}</p>
        {children}
      </div>
    </div>
  );
}
