import type { ReactNode } from "react";

export function ManageListEmpty({ children }: { children: ReactNode }) {
  return <div className="text-center p-pad-12 text-subtle">{children}</div>;
}

export function ManageList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-gap-4">{children}</div>;
}

export function ManageListItem({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-gap-4 p-pad-4 bg-surface border border-line rounded-panel">
      {children}
    </div>
  );
}

export function ManageListActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-gap-2">{children}</div>;
}
