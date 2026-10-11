import { converter } from "culori";
import { z } from "zod";

export const HARBOUR_PALETTE = {
  50: "#e8f0ff",
  100: "#d1e0ff",
  200: "#89adff",
  300: "#7593fa",
  400: "#587bf0",
  500: "#4166e2",
  600: "#2b51d1",
  700: "#2144bb",
  800: "#1a369a",
  900: "#142a7a",
};
export const SHADES = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
] as const;
export const RAMP_SHADES = ["50", "100", "200", "300", "400", "500", "700", "800", "900"] as const;
export type Shade = (typeof SHADES)[number];
export type RampShade = (typeof RAMP_SHADES)[number];
export const colorSchema = z
  .object({
    l: z.number().min(0).max(1),
    c: z.number().min(0).max(0.4),
    h: z.number().min(0).max(360),
  })
  .strict();
export type Oklch = z.infer<typeof colorSchema>;
const rampSchema = z.record(
  z.enum(RAMP_SHADES),
  z
    .object({
      lightness: z.number().min(-1).max(1),
      chroma: z.number().min(-0.4).max(0.4),
      hue: z.number().min(-360).max(360),
    })
    .strict(),
);
export type Ramp = z.infer<typeof rampSchema>;
const toOklch = converter("oklch");
export function fromHex(hex: string): Oklch {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Expected a six-digit hex colour");
  const converted = toOklch(hex);
  if (!converted) throw new Error("Could not convert colour");
  return { l: converted.l, c: converted.c, h: converted.h ?? 0 };
}
export function colorCss(color: Oklch): string {
  return `oklch(${Number(color.l.toFixed(6))} ${Number(color.c.toFixed(6))} ${Number(color.h.toFixed(3))})`;
}
const DEFAULT_PALETTE = z
  .record(z.enum(SHADES), colorSchema)
  .parse(
    Object.fromEntries(
      Object.entries(HARBOUR_PALETTE).map(([shade, hex]) => [shade, fromHex(hex)]),
    ),
  );
export const DEFAULT_BRAND = DEFAULT_PALETTE[600];
export function rampStep(brand: Oklch, color: Oklch): Ramp[RampShade] {
  return {
    lightness: color.l - brand.l,
    chroma: color.c - brand.c,
    hue: color.h - brand.h,
  };
}
export const DEFAULT_RAMP = rampSchema.parse(
  Object.fromEntries(
    RAMP_SHADES.map((shade) => [shade, rampStep(DEFAULT_BRAND, DEFAULT_PALETTE[shade])]),
  ),
);
export const colorThemeSchema = z
  .object({
    brand: colorSchema,
    ramp: rampSchema,
    page: colorSchema.nullable(),
    surface: colorSchema.nullable(),
    body: colorSchema.nullable(),
    heading: colorSchema.nullable(),
    muted: colorSchema.nullable(),
    border: colorSchema.nullable(),
  })
  .strict();
export type ColorTheme = z.infer<typeof colorThemeSchema>;
export const DEFAULT_COLORS: ColorTheme = {
  brand: DEFAULT_BRAND,
  ramp: DEFAULT_RAMP,
  page: null,
  surface: null,
  body: null,
  heading: null,
  muted: null,
  border: null,
};
export const COLOR_ROLES = [
  { key: "page", label: "Page background", source: "White" },
  { key: "surface", label: "Cards / surfaces", source: "White" },
  { key: "body", label: "Body text", source: "600" },
  { key: "heading", label: "Headings", source: "700" },
  { key: "muted", label: "Secondary text", source: "500" },
  { key: "border", label: "Borders", source: "200" },
] as const;
export function resolvePalette(theme: ColorTheme) {
  const palette = { ...DEFAULT_PALETTE, 600: theme.brand };
  for (const shade of RAMP_SHADES) {
    const step = theme.ramp[shade];
    palette[shade] = {
      l: Math.max(0, Math.min(1, theme.brand.l + step.lightness)),
      c: Math.max(0, Math.min(0.4, theme.brand.c + step.chroma)),
      h: (((theme.brand.h + step.hue) % 360) + 360) % 360,
    };
  }
  return palette;
}
export function resolveColors(theme: ColorTheme) {
  const palette = resolvePalette(theme);
  const white: Oklch = { l: 1, c: 0, h: 0 };
  return {
    page: theme.page ?? white,
    surface: theme.surface ?? white,
    body: theme.body ?? palette[600],
    heading: theme.heading ?? palette[700],
    muted: theme.muted ?? palette[500],
    border: theme.border ?? palette[200],
  };
}
