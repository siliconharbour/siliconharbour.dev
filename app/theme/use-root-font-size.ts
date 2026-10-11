import { useEffect, useState } from "react";

export function useRootFontSize() {
  const [pixels, setPixels] = useState<number | null>(null);
  useEffect(() => {
    const measure = () =>
      setPixels(parseFloat(getComputedStyle(document.documentElement).fontSize));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return pixels;
}
