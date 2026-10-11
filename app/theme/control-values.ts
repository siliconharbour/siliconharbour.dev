import { DEFAULT_THEME, themeVariables, type Theme } from "./tokens";

type NumericKey = { [K in keyof Theme]: Theme[K] extends number ? K : never }[keyof Theme];
const referenceTokens = {
  typeScale: { variable: "--text-base", label: "Body size" },
  lineHeight: { variable: "--text-base--line-height", label: "Body line height" },
  padding: { variable: "--theme-pad-4", label: "Spacing 4" },
  gaps: { variable: "--theme-gap-4", label: "Spacing 4" },
} as const;
export function formatValue(value: number, unit: string): string {
  return `${Number(value.toFixed(3))}${unit}`;
}
export function formatRem(css: string, rootPixels: number | null): string {
  return `${formatValue(parseFloat(css), "rem")}${rootPixels === null ? "" : ` (${formatValue(parseFloat(css) * rootPixels, "px")})`}`;
}
export function controlValues(
  key: NumericKey,
  unit: string,
  theme: Theme,
  rootPixels: number | null,
) {
  const reference =
    key in referenceTokens ? referenceTokens[key as keyof typeof referenceTokens] : undefined;
  if (reference) {
    const current = themeVariables(theme)[reference.variable];
    const baseline = themeVariables(DEFAULT_THEME)[reference.variable];
    return {
      label: reference.label,
      current: formatRem(current, rootPixels),
      baseline: formatRem(baseline, rootPixels),
    };
  }
  const length = (value: number, defaultValue = false) => {
    if (unit === "") return formatValue(value * 100, "%");
    if (unit === "em" && rootPixels !== null) {
      const bodySize = defaultValue ? DEFAULT_THEME.typeScale : theme.typeScale;
      return `${formatValue(value, unit)} (${formatValue(value * bodySize * rootPixels, "px")})`;
    }
    return formatValue(value, unit);
  };
  return { label: "", current: length(theme[key]), baseline: length(DEFAULT_THEME[key], true) };
}
