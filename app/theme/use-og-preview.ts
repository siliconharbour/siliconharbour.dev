import type { PreviewLogo } from "./logo-file";
import { useEffect, useState } from "react";
import { useTheme } from "./provider";
import { renderOGPreview } from "./og-preview";

export function useOGPreview(source: string) {
  const { logo } = useTheme();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    source: string;
    logo: PreviewLogo;
    url?: string;
    error?: string;
  }>();
  useEffect(() => {
    setResult(undefined);
    if (!logo) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    renderOGPreview(source, logo, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResult({ source, logo, url: objectUrl });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            source,
            logo,
            error: error instanceof Error ? error.message : "This preview could not be rendered.",
          });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, logo, retry]);
  if (!logo) return { url: source, loading: false, retry: () => setRetry((value) => value + 1) };
  const current = result?.source === source && result.logo === logo ? result : undefined;
  return {
    url: current?.url,
    error: current?.error,
    loading: !current,
    retry: () => {
      setResult(undefined);
      setRetry((value) => value + 1);
    },
  };
}
