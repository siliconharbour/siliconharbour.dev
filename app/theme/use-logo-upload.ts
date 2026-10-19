import { useRef, useState } from "react";
import { readLogo, type PreviewLogo } from "./logo-file";

export function useLogoUpload(
  logo: PreviewLogo | null,
  setImage: (logo: PreviewLogo | null) => void,
) {
  const [logoError, setError] = useState("");
  const [logoLoading, setLoading] = useState(false);
  const revision = useRef(0);
  function setLogo(next: PreviewLogo | null) {
    revision.current++;
    setImage(next);
    setError("");
    setLoading(false);
  }
  async function uploadLogo(file: File) {
    const current = ++revision.current;
    setLoading(true);
    setError("");
    try {
      const image = await readLogo(file);
      if (current === revision.current) setImage(image);
    } catch (error) {
      if (current === revision.current)
        setError(error instanceof Error ? error.message : "This image could not be opened.");
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }
  function cancelLogoUpload() {
    revision.current++;
    setLoading(false);
    setError("");
  }
  return { logo, setLogo, uploadLogo, logoError, logoLoading, cancelLogoUpload };
}
