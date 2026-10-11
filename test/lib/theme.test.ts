import { formatHex } from "culori";
import { colorCss, fromHex, resolvePalette, resolveColors, rampStep } from "~/theme/colors";
import { fontSchema, fontStack, googleFontsUrl } from "~/theme/fonts";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  HARBOUR_PALETTE,
  decodeTheme,
  encodeTheme,
  themeUrl,
  themeVariables,
} from "~/theme/tokens";

describe("shared theme configuration", () => {
  it("round-trips changes while preserving filters and anchors in a share link", () => {
    const theme = {
      ...DEFAULT_THEME,
      brand: fromHex("#238155"),
      panelRadius: 12,
      borderContrast: 0.6,
      borderWidth: 2,
      cardOutlineOpacity: 0.8,
      shadowOpacity: 0.15,
      shadowBlur: 18,
      shadowOffset: 5,
      shadowSpread: -2,
      hoverLift: 3,
      imageTint: 0,
      letterSpacing: 0.015,
      headingFont: "serif" as const,
    };
    const url = new URL(
      themeUrl(
        new URL("https://example.com/jobs?q=engineer&company=acme|beta&sort=newest#list"),
        theme,
      ),
    );
    expect(url.searchParams.get("q")).toBe("engineer");
    expect(url.searchParams.get("company")).toBe("acme|beta");
    expect(url.searchParams.get("sort")).toBe("newest");
    expect(url.hash).toBe("#list");
    expect(url.searchParams.get("studio")).toBe("1");
    expect(decodeTheme(url.searchParams.get("theme")).theme).toEqual(theme);
    expect(JSON.parse(encodeTheme(theme)!)).not.toHaveProperty("typeScale");
  });
  it("rejects unsupported versions, CSS injection, unknown keys and out-of-range values", () => {
    for (const raw of [
      "{",
      JSON.stringify({ v: 3 }),
      JSON.stringify({ v: 2, brand: "url(https://example.com)" }),
      JSON.stringify({ v: 2, bodyFont: "evil; color:red" }),
      JSON.stringify({ v: 2, typeScale: 50 }),
      JSON.stringify({ v: 2, shadowOpacity: 0.9 }),
      JSON.stringify({ v: 2, borderWidth: -1 }),
      JSON.stringify({ v: 2, shadowBlur: "url(https://example.com)" }),
      JSON.stringify({ v: 2, letterSpacing: 2 }),
      JSON.stringify({ v: 2, __unknown: true }),
      " ".repeat(4097),
    ]) {
      expect(decodeTheme(raw)).toMatchObject({ theme: DEFAULT_THEME, error: expect.any(String) });
    }
    expect(decodeTheme(null)).toEqual({});
  });
  it("reset removes stale theme values from share URLs", () => {
    const url = new URL(
      themeUrl(new URL("https://example.com/design?theme=old&q=test"), DEFAULT_THEME),
    );
    expect(url.searchParams.has("theme")).toBe(false);
    expect(url.searchParams.get("q")).toBe("test");
  });
});
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
    expect(decodeTheme(encodeTheme(theme)).theme).toEqual(theme);
    for (const fields of [
      { brand: { l: 2, c: 0.1, h: 20 } },
      { brand: { l: 0.5, c: 0.1, h: -1 } },
      { ramp: { 700: { lightness: 0, chroma: 0, hue: 0 } } },
      { heading: { l: 0.5, c: 0.1, h: 20, extra: true } },
      { bodyFont: 'Font"; color: red' },
    ]) {
      expect(decodeTheme(JSON.stringify({ v: 2, ...fields })).error).toBeDefined();
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
