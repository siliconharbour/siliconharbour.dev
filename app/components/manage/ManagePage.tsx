import type { ReactNode } from "react";
import { Link } from "react-router";

interface ManagePageProps {
  title: string;
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
  maxWidthClassName?: string;
  actions?: ReactNode;
}

export function ManagePage({
  title,
  children,
  backTo = "/manage",
  backLabel = "Back to Dashboard",
  maxWidthClassName = "max-w-4xl",
  actions,
}: ManagePageProps) {
  return (
    <div className="min-h-screen p-6">
      <div className={`${maxWidthClassName} mx-auto flex flex-col gap-6`}>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-harbour-700">{title}</h1>
          {actions}
        </div>
        {children}
        <div>
          <Link to={backTo} className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
