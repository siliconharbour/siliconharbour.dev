import type { ReactNode } from "react";

interface DeleteConfirmationCardProps {
  title: string;
  message: ReactNode;
  children: ReactNode;
}

export function DeleteConfirmationCard({
  title,
  message,
  children,
}: DeleteConfirmationCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-harbour-200 p-6 flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-harbour-700">{title}</h1>
        <p className="text-harbour-500">{message}</p>
        {children}
      </div>
    </div>
  );
}
