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
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className={`${maxWidthClassName} mx-auto flex flex-col gap-gap-6`}>
        <div className="flex flex-wrap items-center justify-between gap-gap-4">
          <h1 className="text-2xl font-semibold text-heading">{title}</h1>
          {actions}
        </div>
        {children}
        <div>
          <Link to={backTo} className="text-sm text-subtle hover:text-body">
            &larr; {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
