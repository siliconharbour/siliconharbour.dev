import { describe, expect, it } from "vitest";
import { controlValues } from "~/theme/control-values";
import { DEFAULT_THEME } from "~/theme/tokens";

describe("theme control readouts", () => {
  it("uses the browser root size and distinguishes changed spacing from defaults", () => {
    const theme = { ...DEFAULT_THEME, padding: 1.5, gaps: 0.75, typeScale: 1.2, lineHeight: 1.1 };
    expect(controlValues("padding", "×", theme, 20)).toMatchObject({
      current: "1.5rem (30px)",
      baseline: "1rem (20px)",
    });
    expect(controlValues("gaps", "×", theme, 20).current).toBe("0.75rem (15px)");
    expect(controlValues("typeScale", "×", theme, 20).current).toBe("1.2rem (24px)");
    expect(controlValues("lineHeight", "×", theme, 20).current).toBe("1.98rem (39.6px)");
  });
  it("resolves em against body size, keeps px fixed, and omits pixels before browser measurement", () => {
    const theme = {
      ...DEFAULT_THEME,
      typeScale: 1.5,
      letterSpacing: 0.02,
      panelRadius: 12,
      shadowOpacity: 0.2,
    };
    expect(controlValues("letterSpacing", "em", theme, 20).current).toBe("0.02em (0.6px)");
    expect(controlValues("panelRadius", "px", theme, 20)).toMatchObject({
      current: "12px",
      baseline: "0px",
    });
    expect(controlValues("shadowOpacity", "", theme, 20).current).toBe("20%");
    expect(controlValues("typeScale", "×", theme, null).current).toBe("1.5rem");
  });
});
