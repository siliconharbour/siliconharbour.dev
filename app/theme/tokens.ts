import { appearanceSchema, DEFAULT_APPEARANCE, appearanceVariables } from "./appearance";
import { z } from "zod";

export const BRAND_LOGO = "/siliconharbour.svg";
export { HARBOUR_PALETTE } from "./colors";
import {
  HARBOUR_PALETTE,
  DEFAULT_COLORS,
  colorThemeSchema,
  colorCss,
  resolveColors,
  resolvePalette,
} from "./colors";
import { fontSchema, fontStack } from "./fonts";
export const themeSchema = colorThemeSchema
  .extend({
    ...appearanceSchema.shape,
    bodyFont: fontSchema,
    headingFont: fontSchema,
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
  ...DEFAULT_COLORS,
  ...DEFAULT_APPEARANCE,
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
  ["white", "#ffffff"],
]) as Record<`harbour${keyof typeof HARBOUR_PALETTE}` | "white", string>;

const sharedSchema = themeSchema
  .partial()
  .extend({ v: z.literal(2) })
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
    Object.entries(theme).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(DEFAULT_THEME[key as keyof Theme]),
    ),
  );
  return Object.keys(changes).length ? JSON.stringify({ v: 2, ...changes }) : null;
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
  "2xs": [0.625, 0.875],
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

export function themeVariables(theme: Theme): Record<string, string> {
  const colors = resolveColors(theme);
  const variables: Record<string, string> = {
    "--theme-page": colorCss(colors.page),
    "--theme-surface": colorCss(colors.surface),
    "--theme-body": colorCss(colors.body),
    "--theme-heading": colorCss(colors.heading),
    "--theme-muted": colorCss(colors.muted),
    "--theme-font-body": fontStack(theme.bodyFont),
    "--theme-font-heading": fontStack(theme.headingFont),
    "--theme-control-radius": `${theme.controlRadius}px`,
    "--theme-panel-radius": `${theme.panelRadius}px`,
    "--theme-stack-step": `${3 * theme.gaps}px`,
  };
  for (const [shade, color] of Object.entries(resolvePalette(theme)))
    variables[`--theme-harbour-${shade}`] = colorCss(color);
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
  return { ...variables, ...appearanceVariables(theme, colors) };
}
