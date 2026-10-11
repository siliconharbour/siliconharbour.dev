import { z } from "zod";

const SYSTEM_FONTS = new Map([
  ["inter", '"Inter", ui-sans-serif, system-ui, sans-serif'],
  ["system", "ui-sans-serif, system-ui, sans-serif"],
  ["serif", 'Georgia, "Times New Roman", serif'],
  ["mono", "ui-monospace, SFMono-Regular, Menlo, monospace"],
]);
export const FONT_PRESETS = [
  { value: "inter", label: "Inter" },
  { value: "system", label: "System sans" },
  { value: "serif", label: "System serif" },
  { value: "mono", label: "System monospace" },
  ...[
    "DM Sans",
    "DM Serif Display",
    "Space Grotesk",
    "IBM Plex Sans",
    "Roboto",
    "Lora",
    "Noto Sans JP",
  ].map((value) => ({ value, label: value })),
];
export const fontSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u, "Enter a font family name, without CSS or a URL.");
export function fontStack(font: string): string {
  return SYSTEM_FONTS.get(font) ?? `${JSON.stringify(font)}, ui-sans-serif, system-ui, sans-serif`;
}
export function googleFontFamilies(body: string, heading: string): string[] {
  return [...new Set([body, heading])].filter((font) => !SYSTEM_FONTS.has(font));
}
export function googleFontsUrl(body: string, heading: string): string | null {
  const families = googleFontFamilies(body, heading);
  if (!families.length) return null;
  const params = new URLSearchParams();
  for (const family of families) params.append("family", family);
  params.set("display", "swap");
  return `https://fonts.googleapis.com/css2?${params}`;
}
