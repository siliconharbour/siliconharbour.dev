import { z } from "zod";
import { colorCss, type Oklch } from "./colors";

export const appearanceSchema = z.object({
  borderContrast: z.number().min(0).max(1),
  borderWidth: z.number().min(0).max(3),
  cardOutlineOpacity: z.number().min(0).max(1),
  shadowOpacity: z.number().min(0).max(0.4),
  shadowBlur: z.number().min(0).max(40),
  shadowOffset: z.number().min(0).max(20),
  shadowSpread: z.number().min(-8).max(12),
  hoverLift: z.number().min(0).max(6),
  imageTint: z.number().min(0).max(0.5),
  letterSpacing: z.number().min(-0.03).max(0.1),
});
export const DEFAULT_APPEARANCE: z.infer<typeof appearanceSchema> = {
  borderContrast: 0,
  borderWidth: 1,
  cardOutlineOpacity: 0.5,
  shadowOpacity: 0,
  shadowBlur: 12,
  shadowOffset: 4,
  shadowSpread: 0,
  hoverLift: 0,
  imageTint: 0.15,
  letterSpacing: 0,
};
export const appearanceControls = [
  { key: "borderContrast", label: "Border contrast", min: 0, max: 1, step: 0.05, unit: "" },
  { key: "borderWidth", label: "Border width", min: 0, max: 3, step: 0.5, unit: "px" },
  {
    key: "cardOutlineOpacity",
    label: "Card outline opacity",
    min: 0,
    max: 1,
    step: 0.05,
    unit: "",
  },
  { key: "shadowOpacity", label: "Shadow opacity", min: 0, max: 0.4, step: 0.01, unit: "" },
  { key: "shadowBlur", label: "Shadow blur", min: 0, max: 40, step: 1, unit: "px" },
  { key: "shadowOffset", label: "Shadow offset", min: 0, max: 20, step: 1, unit: "px" },
  { key: "shadowSpread", label: "Shadow spread", min: -8, max: 12, step: 1, unit: "px" },
  { key: "hoverLift", label: "Card hover lift", min: 0, max: 6, step: 0.5, unit: "px" },
  { key: "imageTint", label: "Image tint strength", min: 0, max: 0.5, step: 0.05, unit: "" },
  { key: "letterSpacing", label: "Letter spacing", min: -0.03, max: 0.1, step: 0.005, unit: "em" },
] as const;

export function appearanceVariables(
  theme: z.infer<typeof appearanceSchema>,
  colors: { border: Oklch; body: Oklch; heading: Oklch },
): Record<string, string> {
  const border =
    theme.borderContrast === 0
      ? colorCss(colors.border)
      : `color-mix(in oklch, ${colorCss(colors.border)}, ${colorCss(colors.body)} ${theme.borderContrast * 100}%)`;
  const shadow =
    theme.shadowOpacity === 0
      ? "none"
      : `0 ${theme.shadowOffset}px ${theme.shadowBlur}px ${theme.shadowSpread}px color-mix(in oklab, ${colorCss(colors.heading)} ${theme.shadowOpacity * 100}%, transparent)`;
  return {
    "--theme-border": border,
    "--theme-border-width": `${theme.borderWidth}px`,
    "--theme-card-middle-outline": `color-mix(in oklab, ${border} ${Math.min(1, theme.cardOutlineOpacity * 1.4) * 100}%, transparent)`,
    "--theme-card-outline": `color-mix(in oklab, ${border} ${theme.cardOutlineOpacity * 100}%, transparent)`,
    "--theme-panel-shadow": shadow,
    "--theme-hover-lift": `${theme.hoverLift}px`,
    "--theme-image-tint": `color-mix(in oklab, var(--theme-harbour-200) ${theme.imageTint * 100}%, transparent)`,
    "--theme-letter-spacing": `${theme.letterSpacing}em`,
  };
}
