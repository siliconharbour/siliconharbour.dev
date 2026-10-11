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
      brand: "#238155",
      panelRadius: 12,
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
      JSON.stringify({ v: 2 }),
      JSON.stringify({ v: 1, brand: "url(https://example.com)" }),
      JSON.stringify({ v: 1, bodyFont: "evil" }),
      JSON.stringify({ v: 1, typeScale: 50 }),
      JSON.stringify({ v: 1, __unknown: true }),
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
      expect(baseline[`--theme-harbour-${shade}`]).toBe(value);
    const updated = themeVariables({
      ...DEFAULT_THEME,
      brand: "#238155",
      padding: 2,
      controlRadius: 12,
    });
    expect(updated["--theme-pad-4"]).toBe("2rem");
    expect(updated["--theme-control-radius"]).toBe("12px");
    expect(updated["--theme-harbour-600"]).toBe("#238155");
    expect(updated).not.toHaveProperty("--spacing");
    expect(updated).not.toHaveProperty("--color-red-600");
  });
});
