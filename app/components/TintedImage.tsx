import type { ReactNode } from "react";

interface TintedImageProps {
  children: ReactNode;
  className?: string;
}

export function TintedImage({ children, className = "" }: TintedImageProps) {
  return (
    <div
      className={`relative after:absolute after:inset-0 after:pointer-events-none after:bg-harbour-200/15 after:transition-opacity hover:after:opacity-0 focus-within:after:opacity-0 group-hover/image-tint:after:opacity-0 group-focus-within/image-tint:after:opacity-0 ${className}`}
    >
      {children}
    </div>
  );
}
