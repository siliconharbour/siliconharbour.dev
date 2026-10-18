import { DOMParser } from "linkedom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { validateSvg } from "~/theme/logo-file";

beforeEach(() => vi.stubGlobal("DOMParser", DOMParser));
afterEach(() => vi.unstubAllGlobals());
describe("preview SVG validation", () => {
  it("accepts the published logo and local gradient references", () => {
    expect(() => validateSvg(readFileSync("public/siliconharbour.svg", "utf8"))).not.toThrow();
    expect(() =>
      validateSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paint"/></defs><path fill="url(#paint)" d="M0 0h10v10z"/></svg>',
      ),
    ).not.toThrow();
  });
  it("rejects active content, entities, remote resources and CSS escapes before decoding", () => {
    const cases = [
      "<script>alert(1)</script>",
      "<foreignObject><div>HTML</div></foreignObject>",
      '<path onload="alert(1)"/>',
      '<image href="http://169.254.169.254/latest/meta-data"/>',
      '<use href="https://example.com/file.svg#mark"/>',
      '<path fill="url(//example.com/image)"/>',
      '<style>@import "https://example.com/style.css";</style>',
      '<path style="fill:u\\72l(//example.com/image)"/>',
    ];
    for (const body of cases)
      expect(() => validateSvg(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`)).toThrow();
    expect(() =>
      validateSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>'),
    ).toThrow();
  });
});
