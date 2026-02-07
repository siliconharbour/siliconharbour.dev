import type { ReactNode } from "react";

export function ManageListEmpty({ children }: { children: ReactNode }) {
  return <div className="text-center p-12 text-harbour-400">{children}</div>;
}

export function ManageList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

export function ManageListItem({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-4 p-4 bg-white border border-harbour-200">{children}</div>;
}

export function ManageListActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}
