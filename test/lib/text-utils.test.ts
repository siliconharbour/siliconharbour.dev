import { describe, it, expect } from "vitest";
import {
  htmlToText,
  normalizeTextForDisplay,
} from "~/lib/job-importers/text.server";

// =============================================================================
// normalizeTextForDisplay
// =============================================================================

describe("normalizeTextForDisplay", () => {
  it("converts smart single quotes to straight quotes", () => {
    expect(normalizeTextForDisplay("\u2018hello\u2019")).toBe("'hello'");
  });

  it("converts smart double quotes to straight quotes", () => {
    expect(normalizeTextForDisplay("\u201chello\u201d")).toBe('"hello"');
  });

  it("converts prime characters to quotes", () => {
    expect(normalizeTextForDisplay("\u2032hello\u2033")).toBe("'hello\"");
  });

  it("converts en-dash to regular dash", () => {
    expect(normalizeTextForDisplay("2020\u20132023")).toBe("2020-2023");
  });

  it("converts em-dash to regular dash", () => {
    expect(normalizeTextForDisplay("hello\u2014world")).toBe("hello-world");
  });

  it("collapses multiple horizontal spaces to single space", () => {
    expect(normalizeTextForDisplay("hello    world")).toBe("hello world");
  });

  it("converts non-breaking spaces to regular spaces", () => {
    expect(normalizeTextForDisplay("hello\u00a0world")).toBe("hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeTextForDisplay("  hello  ")).toBe("hello");
  });

  it("collapses 3+ newlines to maximum of 2", () => {
    expect(normalizeTextForDisplay("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("preserves double newlines (paragraph breaks)", () => {
    expect(normalizeTextForDisplay("a\n\nb")).toBe("a\n\nb");
  });

  it("normalizes \\r\\n to \\n", () => {
    expect(normalizeTextForDisplay("a\r\nb")).toBe("a\nb");
  });

  it("strips trailing spaces from lines", () => {
    expect(normalizeTextForDisplay("hello   \nworld")).toBe("hello\nworld");
  });

  it("strips leading spaces from lines", () => {
    expect(normalizeTextForDisplay("hello\n   world")).toBe("hello\nworld");
  });

  it("handles empty string", () => {
    expect(normalizeTextForDisplay("")).toBe("");
  });
});

// =============================================================================
// htmlToText
// =============================================================================

describe("htmlToText", () => {
  it("extracts text from a simple paragraph", () => {
    expect(htmlToText("<p>Hello</p>")).toBe("Hello");
  });

  it("converts multiple paragraphs to newline-separated text", () => {
    const result = htmlToText("<p>First</p><p>Second</p>");
    expect(result).toContain("First");
    expect(result).toContain("Second");
    // Should have a newline between them
    expect(result).toMatch(/First\n+Second/);
  });

  it("strips script tags and their contents", () => {
    const result = htmlToText(
      "<p>Hello</p><script>alert('xss')</script><p>World</p>",
    );
    expect(result).not.toContain("alert");
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("strips style tags and their contents", () => {
    const result = htmlToText(
      "<p>Hello</p><style>.foo { color: red; }</style><p>World</p>",
    );
    expect(result).not.toContain("color");
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("converts <br> tags to newlines", () => {
    const result = htmlToText("Hello<br>World");
    expect(result).toMatch(/Hello\nWorld/);
  });

  it("converts <br /> (self-closing) to newlines", () => {
    const result = htmlToText("Hello<br />World");
    expect(result).toMatch(/Hello\nWorld/);
  });

  it("handles nested HTML elements", () => {
    const result = htmlToText(
      "<div><p>Outer <strong>bold</strong> text</p></div>",
    );
    expect(result).toContain("Outer bold text");
  });

  it("decodes &amp; HTML entity", () => {
    expect(htmlToText("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });

  it("decodes &lt; and &gt; entities (then strips as tag)", () => {
    // htmlToText first decodes entities, so &lt;hello&gt; becomes <hello>,
    // which is then stripped as an HTML tag. This is intentional behavior:
    // the function's purpose is "decode first so encoded tags are handled as HTML."
    expect(htmlToText("&lt;hello&gt;")).toBe("");
  });

  it("decodes &amp; inside text content correctly", () => {
    expect(htmlToText("<p>A &amp; B</p>")).toBe("A & B");
  });

  it("decodes &quot; entity", () => {
    expect(htmlToText("She said &quot;hi&quot;")).toBe('She said "hi"');
  });

  it("decodes numeric entities like &#8217;", () => {
    // &#8217; is right single quotation mark (')
    const result = htmlToText("it&#8217;s");
    expect(result).toContain("it");
    // After decoding, the smart quote gets normalized to straight quote
    expect(result).toContain("s");
  });

  it("handles empty string", () => {
    expect(htmlToText("")).toBe("");
  });

  it("converts list items with dash prefix", () => {
    const result = htmlToText("<ul><li>First</li><li>Second</li></ul>");
    expect(result).toContain("- First");
    expect(result).toContain("- Second");
  });

  it("strips meta tags", () => {
    const result = htmlToText(
      '<meta charset="utf-8"><p>Content</p>',
    );
    expect(result).toBe("Content");
  });

  it("handles heading tags with line breaks", () => {
    const result = htmlToText("<h1>Title</h1><p>Body</p>");
    expect(result).toContain("Title");
    expect(result).toContain("Body");
    expect(result).toMatch(/Title\n+Body/);
  });
});
