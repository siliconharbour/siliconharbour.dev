import type { OGPreviewTemplate } from "~/lib/og-preview.server";
import { loadImage, type PreviewLogo } from "./logo-file";

export async function renderOGPreview(
  source: string,
  logo: PreviewLogo,
  signal: AbortSignal,
): Promise<Blob> {
  const url = new URL(source, window.location.origin);
  if (url.origin !== window.location.origin)
    throw new Error("Social previews must use this site's templates.");
  url.searchParams.set("preview", "template");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("The social image template could not load.");
  const template: OGPreviewTemplate = await response.json();
  const svgUrl = URL.createObjectURL(new Blob([template.svg], { type: "image/svg+xml" }));
  try {
    const [background, graphic] = await Promise.all([loadImage(svgUrl), loadImage(logo.src)]);
    signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not create the social image.");
    context.drawImage(background, 0, 0, canvas.width, canvas.height);
    const slot = template.logo;
    const scale = Math.min(slot.width / graphic.naturalWidth, slot.height / graphic.naturalHeight);
    const width = graphic.naturalWidth * scale;
    const height = graphic.naturalHeight * scale;
    context.drawImage(
      graphic,
      slot.left + (slot.width - width) / 2,
      slot.top + (slot.height - height) / 2,
      width,
      height,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("The social image could not be exported.")),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
