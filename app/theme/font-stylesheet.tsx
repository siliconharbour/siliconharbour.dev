import { useEffect, useRef } from "react";

export function FontStylesheet({
  url,
  families,
  onStatus,
}: {
  url: string;
  families: string[];
  onStatus: (error: string | undefined) => void;
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const failure =
    "Google Fonts could not load this family. Check the name or connection; the fallback font is shown.";
  async function loaded() {
    try {
      const faces = await Promise.all(
        families.map((family) => document.fonts.load(`16px ${JSON.stringify(family)}`)),
      );
      if (!active.current) return;
      const missing = families.filter((_, index) => !faces[index].length);
      onStatus(
        missing.length
          ? `Google Fonts could not load ${missing.join(", ")}. Check the family name; the fallback font is shown.`
          : undefined,
      );
    } catch {
      if (active.current) onStatus(failure);
    }
  }
  return <link rel="stylesheet" href={url} onLoad={loaded} onError={() => onStatus(failure)} />;
}
