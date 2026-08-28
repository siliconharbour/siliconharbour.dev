import { describe, expect, it } from "vitest";
import { buttonClassName } from "~/components/ui";

describe("design primitives", () => {
  it("uses the harbour primary treatment without rounded corners or shadows", () => {
    const classes = buttonClassName();

    expect(classes).toContain("bg-harbour-600");
    expect(classes).toContain("hover:bg-harbour-700");
    expect(classes).not.toMatch(/rounded|shadow/);
  });

  it("keeps semantic danger and success actions distinct", () => {
    expect(buttonClassName({ tone: "danger" })).toContain("bg-red-600");
    expect(buttonClassName({ tone: "success" })).toContain("bg-green-600");
  });
});
