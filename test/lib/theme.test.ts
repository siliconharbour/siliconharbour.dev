import { formatHex } from "culori";
import { colorCss, fromHex, resolvePalette, resolveColors, rampStep } from "~/theme/colors";
import { fontSchema, fontStack, googleFontsUrl } from "~/theme/fonts";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, HARBOUR_PALETTE, themeSchema, themeVariables } from "~/theme/tokens";

describe("runtime tokens", () => {
  it("preserves the original palette and leaves icon sizing separate from density", () => {
    const baseline = themeVariables(DEFAULT_THEME);
    for (const [shade, value] of Object.entries(HARBOUR_PALETTE))
      expect(formatHex(baseline[`--theme-harbour-${shade}`])).toBe(value);
    const updated = themeVariables({
      ...DEFAULT_THEME,
      brand: fromHex("#238155"),
      padding: 2,
      controlRadius: 12,
    });
    expect(updated["--theme-pad-4"]).toBe("2rem");
    expect(updated["--theme-control-radius"]).toBe("12px");
    expect(formatHex(updated["--theme-harbour-600"])).toBe("#238155");
    expect(updated).not.toHaveProperty("--spacing");
    expect(updated).not.toHaveProperty("--color-red-600");
  });
});

describe("linked OKLCH colours", () => {
  it("changes all coloured roles with the main colour and keeps role overrides explicit", () => {
    const theme = { ...DEFAULT_THEME, brand: fromHex("#238155") };
    const palette = resolvePalette(theme);
    const colors = resolveColors(theme);
    expect(colors.body).toEqual(theme.brand);
    expect(colors.heading).toEqual(palette[700]);
    expect(colors.muted).toEqual(palette[500]);
    expect(colors.border).toEqual(palette[200]);
    expect(colors.heading.h).not.toBe(resolveColors(DEFAULT_THEME).heading.h);
    expect(colors.surface).toEqual({ l: 1, c: 0, h: 0 });
    const custom = fromHex("#ffbb00");
    expect(resolveColors({ ...theme, heading: custom }).heading).toEqual(custom);
    expect(resolveColors({ ...theme, heading: null }).heading).toEqual(palette[700]);
  });
  it("keeps edited ramp stops relative, including edits to an achromatic main colour", () => {
    const brand = { l: 0.5, c: 0, h: 120 };
    const stop = { l: 0.7, c: 0.15, h: 150 };
    const theme = {
      ...DEFAULT_THEME,
      brand,
      ramp: { ...DEFAULT_THEME.ramp, 200: rampStep(brand, stop) },
    };
    expect(resolvePalette(theme)[200]).toEqual(stop);
    const shifted = resolvePalette({ ...theme, brand: { l: 0.6, c: 0.1, h: 350 } })[200];
    expect(shifted.l).toBeCloseTo(0.8);
    expect(shifted.c).toBeCloseTo(0.25);
    expect(shifted.h).toBe(20);
    expect(resolvePalette({ ...theme, brand: { l: 1, c: 0.4, h: 360 } })[200]).toEqual({
      l: 1,
      c: 0.4,
      h: 30,
    });
  });
  it("shares ramp edits, role overrides and arbitrary Google Fonts, rejecting nested invalid data", () => {
    const theme = {
      ...DEFAULT_THEME,
      bodyFont: "IBM Plex Sans",
      headingFont: "Noto Sans JP",
      heading: { l: 0.5, c: 0.1, h: 90 },
      ramp: { ...DEFAULT_THEME.ramp, 700: { lightness: -0.1, chroma: -0.02, hue: 30 } },
    };
    expect(themeSchema.parse(theme)).toEqual(theme);
    for (const fields of [
      { brand: { l: 2, c: 0.1, h: 20 } },
      { brand: { l: 0.5, c: 0.1, h: -1 } },
      { ramp: { 700: { lightness: 0, chroma: 0, hue: 0 } } },
      { heading: { l: 0.5, c: 0.1, h: 20, extra: true } },
      { bodyFont: 'Font"; color: red' },
    ]) {
      expect(themeSchema.safeParse({ ...DEFAULT_THEME, ...fields }).success).toBe(false);
    }
    expect(colorCss(theme.heading)).toMatch(/^oklch\(/);
  });
});
describe("font configuration", () => {
  it("loads only selected Google families, safely escaping and encoding names", () => {
    expect(googleFontsUrl("inter", "system")).toBeNull();
    const url = new URL(googleFontsUrl("IBM Plex Sans", "IBM Plex Sans")!);
    expect(url.origin).toBe("https://fonts.googleapis.com");
    expect(url.searchParams.getAll("family")).toEqual(["IBM Plex Sans"]);
    expect(url.searchParams.get("display")).toBe("swap");
    expect(fontSchema.parse("  Noto Sans JP  ")).toBe("Noto Sans JP");
    expect(fontStack("system")).toBe("ui-sans-serif, system-ui, sans-serif");
    expect(fontStack("constructor")).toBe('"constructor", ui-sans-serif, system-ui, sans-serif');
    expect(fontStack("IBM Plex Sans")).toContain('"IBM Plex Sans"');
  });
});
