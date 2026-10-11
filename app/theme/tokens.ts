import { z } from "zod";

export const BRAND_LOGO = "/siliconharbour.svg";
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
export const FONT_OPTIONS = {
  inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
  system: "ui-sans-serif, system-ui, sans-serif",
  serif: 'Georgia, "Times New Roman", serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toLowerCase());
export const themeSchema = z
  .object({
    brand: color,
    page: color,
    surface: color,
    body: color,
    heading: color,
    muted: color,
    border: color,
    bodyFont: z.enum(["inter", "system", "serif", "mono"]),
    headingFont: z.enum(["inter", "system", "serif", "mono"]),
    typeScale: z.number().min(0.8).max(1.5),
    lineHeight: z.number().min(1).max(1.4),
    padding: z.number().min(0.5).max(2),
    gaps: z.number().min(0.5).max(2),
    controlRadius: z.number().min(0).max(24),
    panelRadius: z.number().min(0).max(32),
  })
  .strict();
export type Theme = z.infer<typeof themeSchema>;
export const DEFAULT_THEME: Theme = {
  brand: HARBOUR_PALETTE[600],
  page: "#ffffff",
  surface: "#ffffff",
  body: HARBOUR_PALETTE[600],
  heading: HARBOUR_PALETTE[700],
  muted: HARBOUR_PALETTE[500],
  border: HARBOUR_PALETTE[200],
  bodyFont: "inter",
  headingFont: "inter",
  typeScale: 1,
  lineHeight: 1,
  padding: 1,
  gaps: 1,
  controlRadius: 0,
  panelRadius: 0,
};
export const DEFAULT_OG_COLORS = Object.fromEntries([
  ...Object.entries(HARBOUR_PALETTE).map(([shade, value]) => [`harbour${shade}`, value]),
  ["white", DEFAULT_THEME.surface],
]) as Record<`harbour${keyof typeof HARBOUR_PALETTE}` | "white", string>;

const sharedSchema = themeSchema
  .partial()
  .extend({ v: z.literal(1) })
  .strict();
export function decodeTheme(raw: string | null): { theme?: Theme; error?: string } {
  if (raw === null) return {};
  try {
    if (raw.length > 4096) throw new Error("Too large");
    const parsed = sharedSchema.parse(JSON.parse(raw));
    const { v: _version, ...overrides } = parsed;
    return { theme: { ...DEFAULT_THEME, ...overrides } };
  } catch {
    return {
      theme: { ...DEFAULT_THEME },
      error: "This theme link is invalid or unsupported. Default settings were loaded.",
    };
  }
}
export function encodeTheme(theme: Theme): string | null {
  const changes = Object.fromEntries(
    Object.entries(theme).filter(([key, value]) => value !== DEFAULT_THEME[key as keyof Theme]),
  );
  return Object.keys(changes).length ? JSON.stringify({ v: 1, ...changes }) : null;
}
export function themeUrl(url: URL, theme: Theme): string {
  const next = new URL(url);
  const encoded = encodeTheme(theme);
  if (encoded) next.searchParams.set("theme", encoded);
  else next.searchParams.delete("theme");
  next.searchParams.set("studio", "1");
  return next.toString();
}

const textSizes = {
  xs: [0.75, 1],
  sm: [0.875, 1.25],
  base: [1, 1.5],
  lg: [1.125, 1.75],
  xl: [1.25, 1.75],
  "2xl": [1.5, 2],
  "3xl": [1.875, 2.25],
  "4xl": [2.25, 2.5],
  "5xl": [3, 1],
  "6xl": [3.75, 1],
  "7xl": [4.5, 1],
  "8xl": [6, 1],
  "9xl": [8, 1],
};
export const SPACING_STEPS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44,
  48, 52, 56, 60, 64, 72, 80, 96,
];
export function spacingName(step: number): string {
  return String(step).replace(".", "-");
}

function mix(first: string, second: string, amount: number): string {
  const a = first
    .slice(1)
    .match(/../g)!
    .map((hex) => parseInt(hex, 16));
  const b = second
    .slice(1)
    .match(/../g)!
    .map((hex) => parseInt(hex, 16));
  return `#${a
    .map((value, i) =>
      Math.round(value * (1 - amount) + b[i] * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
export function themeVariables(theme: Theme): Record<string, string> {
  const variables: Record<string, string> = {
    "--theme-page": theme.page,
    "--theme-surface": theme.surface,
    "--theme-body": theme.body,
    "--theme-heading": theme.heading,
    "--theme-muted": theme.muted,
    "--theme-border": theme.border,
    "--theme-font-body": FONT_OPTIONS[theme.bodyFont],
    "--theme-font-heading": FONT_OPTIONS[theme.headingFont],
    "--theme-control-radius": `${theme.controlRadius}px`,
    "--theme-panel-radius": `${theme.panelRadius}px`,
  };
  for (const [shade, original] of Object.entries(HARBOUR_PALETTE)) {
    const n = Number(shade);
    const value =
      theme.brand === DEFAULT_THEME.brand
        ? original
        : n === 600
          ? theme.brand
          : n < 600
            ? mix(
                theme.brand,
                theme.surface,
                (
                  { 50: 0.94, 100: 0.85, 200: 0.55, 300: 0.4, 400: 0.25, 500: 0.1 } as Record<
                    number,
                    number
                  >
                )[n],
              )
            : mix(theme.brand, "#000000", (n - 600) / 650);
    variables[`--theme-harbour-${shade}`] = value;
  }
  for (const [size, [font, leading]] of Object.entries(textSizes)) {
    variables[`--text-${size}`] = `${font * theme.typeScale}rem`;
    variables[`--text-${size}--line-height`] =
      font >= 3 ? String(theme.lineHeight) : `${leading * theme.typeScale * theme.lineHeight}rem`;
  }
  for (const [name, value] of Object.entries({
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  }))
    variables[`--leading-${name}`] = String(value * theme.lineHeight);
  for (const step of SPACING_STEPS) {
    variables[`--theme-pad-${spacingName(step)}`] = `${step * 0.25 * theme.padding}rem`;
    variables[`--theme-gap-${spacingName(step)}`] = `${step * 0.25 * theme.gaps}rem`;
  }
  return variables;
}
