export interface PreviewLogo {
  src: string;
  name: string;
  width: number;
  height: number;
}
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export function validateSvg(source: string) {
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(source))
    throw new Error("SVG files cannot include document types, entities or stylesheets.");
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg")
    throw new Error("This SVG could not be read.");
  for (const node of doc.querySelectorAll("*")) {
    if (
      [
        "script",
        "foreignobject",
        "iframe",
        "object",
        "embed",
        "image",
        "feimage",
        "animate",
        "animatetransform",
        "set",
      ].includes(node.localName.toLowerCase())
    )
      throw new Error("Use a self-contained, static SVG without scripts or embedded images.");
    for (const attr of node.attributes) {
      if (/^on/i.test(attr.localName)) throw new Error("SVG event handlers are not supported.");
      if (["href", "src"].includes(attr.localName) && !attr.value.startsWith("#"))
        throw new Error("SVG files cannot load external resources.");
      if (
        /@import|@font-face|(?:https?:|file:|data:|javascript:|\/\/)/i.test(attr.value) &&
        !attr.name.startsWith("xmlns")
      )
        throw new Error("SVG files cannot load external resources.");
      if (attr.value.includes("\\"))
        throw new Error("Export this image as a plain SVG without escaped CSS.");
      for (const match of attr.value.matchAll(/url\(([^)]*)\)/gi)) {
        if (!/^["']?#[\w.-]+["']?$/.test(match[1].trim()))
          throw new Error("SVG references must point to shapes inside the file.");
      }
    }
    if (node.localName.toLowerCase() === "style" && /[@\\]|url\(/i.test(node.textContent ?? ""))
      throw new Error(
        "SVG styles cannot load resources. Use inline fills for gradients and patterns.",
      );
  }
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("This image could not be read. Try SVG, PNG, JPEG or WebP."));
    image.src = src;
  });
}
export async function readLogo(file: File): Promise<PreviewLogo> {
  if (file.size > MAX_BYTES) throw new Error("Choose a file smaller than 5 MB.");
  if (!MIME_TYPES.has(file.type))
    throw new Error("Choose an SVG, PNG, JPEG, WebP, GIF or AVIF image.");
  if (file.type === "image/svg+xml") validateSvg(await file.text());
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 16_000_000
    )
      throw new Error("Choose an image no larger than 16 megapixels.");
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not open an image canvas.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      src: canvas.toDataURL("image/png"),
      name: file.name,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
