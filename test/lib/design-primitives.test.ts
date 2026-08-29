import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buttonClassName } from "~/components/ui";

const colors: Record<string, string> = {
  white: "#ffffff",
  "harbour-50": "#e8f0ff",
  "harbour-100": "#d1e0ff",
  "harbour-200": "#89adff",
  "harbour-600": "#2b51d1",
  "harbour-700": "#2144bb",
  "harbour-800": "#1a369a",
  "red-600": "#dc2626",
  "red-700": "#b91c1c",
  "amber-700": "#b45309",
  "amber-800": "#92400e",
  "green-700": "#15803d",
  "green-800": "#166534",
};

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function colorClass(classes: string, prefix: "bg-" | "text-", hover: boolean): string {
  const marker = hover ? `hover:${prefix}` : prefix;
  const token = classes.split(/\s+/).find((value) => value.startsWith(marker));
  if (!token) throw new Error(`Missing ${hover ? "hover " : ""}${prefix}color in: ${classes}`);
  return token.slice(marker.length);
}

describe("design primitives", () => {
  it("uses the harbour primary treatment without rounded corners or shadows", () => {
    const classes = buttonClassName();

    expect(classes).toContain("bg-harbour-600");
    expect(classes).toContain("hover:bg-harbour-700");
    expect(classes).not.toMatch(/rounded|shadow/);
  });

  it("keeps semantic danger and success actions distinct", () => {
    expect(buttonClassName({ tone: "danger" })).toContain("bg-red-600");
    expect(buttonClassName({ tone: "success" })).toContain("bg-green-700");
  });

  it.each(["primary", "secondary", "ghost", "danger", "warning", "success"] as const)(
    "%s buttons meet WCAG AA contrast in normal and hover states",
    (tone) => {
      const classes = buttonClassName({ tone });
      const normalBackground = colorClass(classes, "bg-", false);
      const normalText = colorClass(classes, "text-", false);
      const hoverBackground = colorClass(classes, "bg-", true);
      const hoverText = colorClass(classes, "text-", true);

      expect(contrast(colors[normalBackground], colors[normalText])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors[hoverBackground], colors[hoverText])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("does not globally override link and button hover text colors", () => {
    const css = readFileSync(new URL("../../app/app.css", import.meta.url), "utf8");
    expect(css).not.toMatch(/\[class\*=["']bg-(?:harbour|red|green)/);
  });
});
