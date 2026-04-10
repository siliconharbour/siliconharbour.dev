import { describe, it, expect } from "vitest";
import { parseReferences } from "~/lib/references/parser";

describe("parseReferences", () => {
  it("extracts a simple reference", () => {
    const refs = parseReferences("Check out [[Verafin]]");
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("Verafin");
    expect(refs[0].fullMatch).toBe("[[Verafin]]");
    expect(refs[0].relation).toBeUndefined();
  });

  it("extracts multiple references", () => {
    const refs = parseReferences("[[A]] and [[B]]");
    expect(refs).toHaveLength(2);
    expect(refs[0].text).toBe("A");
    expect(refs[1].text).toBe("B");
  });

  it("parses relation syntax with 'at'", () => {
    const refs = parseReferences("[[{CEO} at {CoLab Software}]]");
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("CoLab Software");
    expect(refs[0].relation).toBe("CEO");
  });

  it("parses relation syntax with 'of'", () => {
    const refs = parseReferences("[[{Founder} of {Startup}]]");
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("Startup");
    expect(refs[0].relation).toBe("Founder");
  });

  it("returns empty array for plain text with no references", () => {
    const refs = parseReferences("Plain text with no references");
    expect(refs).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    const refs = parseReferences("");
    expect(refs).toHaveLength(0);
  });

  it("extracts adjacent references", () => {
    const refs = parseReferences("[[A]][[B]]");
    expect(refs).toHaveLength(2);
    expect(refs[0].text).toBe("A");
    expect(refs[1].text).toBe("B");
  });

  it("preserves special characters in reference text", () => {
    const refs = parseReferences("[[10am @ MUN]]");
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("10am @ MUN");
  });

  it("captures the correct index for each reference", () => {
    const refs = parseReferences("Hello [[A]] world [[B]]");
    expect(refs[0].index).toBe(6);
    expect(refs[1].index).toBe(18);
  });

  it("handles reference with extra whitespace inside brackets", () => {
    const refs = parseReferences("[[ Verafin ]]");
    expect(refs).toHaveLength(1);
    expect(refs[0].text).toBe("Verafin");
  });

  it("handles mixed simple and relation references", () => {
    const refs = parseReferences(
      "[[Verafin]] is where [[{CEO} at {CoLab Software}]] works",
    );
    expect(refs).toHaveLength(2);
    expect(refs[0].text).toBe("Verafin");
    expect(refs[0].relation).toBeUndefined();
    expect(refs[1].text).toBe("CoLab Software");
    expect(refs[1].relation).toBe("CEO");
  });
});
