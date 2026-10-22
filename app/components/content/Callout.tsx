import type { ReactNode } from "react";

interface CalloutProps {
  type?: "warning" | "info" | "success";
  children: ReactNode;
}

const styles = {
  warning: "bg-red-50 border-red-200 text-red-800",
  info: "bg-soft border-line text-harbour-800",
  success: "bg-green-50 border-green-200 text-green-800",
};

/**
 * Callout box for important notices
 */
export function Callout({ type = "info", children }: CalloutProps) {
  return (
    <div className={`not-prose border px-pad-4 py-pad-3 my-6 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}
