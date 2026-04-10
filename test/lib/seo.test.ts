import { describe, it, expect } from "vitest";
import { stripMarkdown, buildSeoMeta } from "~/lib/seo";

// =============================================================================
// stripMarkdown
// =============================================================================

describe("stripMarkdown", () => {
  it("strips simple [[wikilinks]]", () => {
    const result = stripMarkdown("Check out [[Verafin]] today");
    expect(result).not.toContain("[[");
    expect(result).not.toContain("]]");
    expect(result).toContain("Verafin");
  });

  it("strips [[Entity|Display Text]] pipe syntax, keeping the entity", () => {
    const result = stripMarkdown("See [[CoLab|CoLab Software]] for details");
    expect(result).not.toContain("[[");
    expect(result).not.toContain("]]");
    expect(result).toContain("CoLab");
  });

  it("strips **bold** markers", () => {
    const result = stripMarkdown("This is **bold** text");
    expect(result).not.toContain("**");
    expect(result).toContain("bold");
  });

  it("strips *italic* markers", () => {
    const result = stripMarkdown("This is *italic* text");
    expect(result).not.toContain("*");
    expect(result).toContain("italic");
  });

  it("strips [links](url) keeping the text", () => {
    const result = stripMarkdown("Visit [our site](https://example.com) now");
    expect(result).not.toContain("[");
    expect(result).not.toContain("](");
    expect(result).toContain("our site");
  });

  it("truncates to maxLength and appends ellipsis", () => {
    const longText = "A".repeat(200);
    const result = stripMarkdown(longText, 50);
    // Result should be at most 50 chars from the slice, then trimmed with ellipsis
    expect(result.length).toBeLessThanOrEqual(51); // 50 + "…"
  });

  it("handles empty string", () => {
    expect(stripMarkdown("")).toBe("");
  });

  it("handles null", () => {
    expect(stripMarkdown(null)).toBe("");
  });

  it("handles undefined", () => {
    expect(stripMarkdown(undefined)).toBe("");
  });

  it("handles text shorter than maxLength", () => {
    const result = stripMarkdown("Short text", 155);
    expect(result).toContain("Short text");
  });

  it("strips heading markers", () => {
    const result = stripMarkdown("## Hello World");
    expect(result).not.toContain("##");
    expect(result).toContain("Hello World");
  });

  it("strips image syntax", () => {
    const result = stripMarkdown("Before ![alt](image.png) After");
    expect(result).not.toContain("![");
    expect(result).toContain("Before");
    expect(result).toContain("After");
  });
});

// =============================================================================
// buildSeoMeta
// =============================================================================

describe("buildSeoMeta", () => {
  it("returns array with title and og tags", () => {
    const tags = buildSeoMeta({
      title: "Test Page",
      url: "/test",
    });

    expect(Array.isArray(tags)).toBe(true);

    // Title tag
    const titleTag = tags.find((t) => "title" in t);
    expect(titleTag).toBeDefined();
    expect(titleTag!.title).toContain("Test Page");
    expect(titleTag!.title).toContain("siliconharbour.dev");

    // og:title
    const ogTitle = tags.find((t) => t.property === "og:title");
    expect(ogTitle).toBeDefined();
    expect(ogTitle!.content).toBe("Test Page");

    // og:url uses full URL
    const ogUrl = tags.find((t) => t.property === "og:url");
    expect(ogUrl).toBeDefined();
    expect(ogUrl!.content).toBe("https://siliconharbour.dev/test");
  });

  it("includes description tags when description is provided", () => {
    const tags = buildSeoMeta({
      title: "Test",
      description: "A test description",
      url: "/test",
    });

    const descTag = tags.find((t) => t.name === "description");
    expect(descTag).toBeDefined();
    expect(descTag!.content).toBe("A test description");

    const ogDesc = tags.find((t) => t.property === "og:description");
    expect(ogDesc).toBeDefined();
    expect(ogDesc!.content).toBe("A test description");

    const twitterDesc = tags.find((t) => t.name === "twitter:description");
    expect(twitterDesc).toBeDefined();
    expect(twitterDesc!.content).toBe("A test description");
  });

  it("does not include description tags when description is omitted", () => {
    const tags = buildSeoMeta({
      title: "Test",
      url: "/test",
    });

    const descTag = tags.find((t) => t.name === "description");
    expect(descTag).toBeUndefined();
  });

  it("uses custom ogType", () => {
    const tags = buildSeoMeta({
      title: "Article",
      url: "/article",
      ogType: "article",
    });

    const ogType = tags.find((t) => t.property === "og:type");
    expect(ogType).toBeDefined();
    expect(ogType!.content).toBe("article");
  });

  it("defaults ogType to website", () => {
    const tags = buildSeoMeta({
      title: "Test",
      url: "/test",
    });

    const ogType = tags.find((t) => t.property === "og:type");
    expect(ogType!.content).toBe("website");
  });

  it("uses custom ogImage", () => {
    const tags = buildSeoMeta({
      title: "Test",
      url: "/test",
      ogImage: "https://example.com/image.png",
    });

    const ogImage = tags.find((t) => t.property === "og:image");
    expect(ogImage).toBeDefined();
    expect(ogImage!.content).toBe("https://example.com/image.png");
  });

  it("defaults ogImage to site SVG", () => {
    const tags = buildSeoMeta({
      title: "Test",
      url: "/test",
    });

    const ogImage = tags.find((t) => t.property === "og:image");
    expect(ogImage!.content).toBe(
      "https://siliconharbour.dev/siliconharbour.svg",
    );
  });

  it("does not double-append site name if title already includes it", () => {
    const tags = buildSeoMeta({
      title: "siliconharbour.dev",
      url: "/",
    });

    const titleTag = tags.find((t) => "title" in t);
    expect(titleTag!.title).toBe("siliconharbour.dev");
  });

  it("preserves full URL if url starts with http", () => {
    const tags = buildSeoMeta({
      title: "Test",
      url: "https://custom.example.com/page",
    });

    const ogUrl = tags.find((t) => t.property === "og:url");
    expect(ogUrl!.content).toBe("https://custom.example.com/page");
  });

  it("includes canonical link tag", () => {
    const tags = buildSeoMeta({
      title: "Test",
      url: "/test",
    });

    const canonical = tags.find(
      (t) => t.tagName === "link" && t.rel === "canonical",
    );
    expect(canonical).toBeDefined();
    expect(canonical!.href).toBe("https://siliconharbour.dev/test");
  });

  it("includes twitter card tags", () => {
    const tags = buildSeoMeta({
      title: "Test",
      url: "/test",
    });

    const card = tags.find((t) => t.name === "twitter:card");
    expect(card!.content).toBe("summary_large_image");

    const twitterTitle = tags.find((t) => t.name === "twitter:title");
    expect(twitterTitle!.content).toBe("Test");
  });
});
