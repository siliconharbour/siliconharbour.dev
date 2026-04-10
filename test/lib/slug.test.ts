import { describe, it, expect } from "vitest";
import { generateSlug, makeSlugUnique } from "~/lib/slug";

// =============================================================================
// generateSlug
// =============================================================================

describe("generateSlug", () => {
  it("converts basic text to lowercase hyphenated slug", () => {
    expect(generateSlug("Hello World")).toBe("hello-world");
  });

  it("strips special characters and collapses hyphens", () => {
    expect(generateSlug("10am @ MUN")).toBe("10am-mun");
  });

  it("replaces underscores with hyphens", () => {
    expect(generateSlug("foo_bar")).toBe("foo-bar");
  });

  it("trims leading and trailing spaces", () => {
    expect(generateSlug("  hello world  ")).toBe("hello-world");
  });

  it("removes leading and trailing hyphens", () => {
    expect(generateSlug("-hello-world-")).toBe("hello-world");
  });

  it("collapses multiple consecutive spaces into a single hyphen", () => {
    expect(generateSlug("hello    world")).toBe("hello-world");
  });

  it("collapses multiple consecutive hyphens into one", () => {
    expect(generateSlug("hello---world")).toBe("hello-world");
  });

  it("returns empty string for empty input", () => {
    expect(generateSlug("")).toBe("");
  });

  it("strips non-ASCII unicode characters", () => {
    // é is stripped (non-alphanumeric after lowercase), leaving "caf"
    expect(generateSlug("Café")).toBe("caf");
  });

  it("passes through an already-valid slug unchanged", () => {
    expect(generateSlug("already-valid-slug")).toBe("already-valid-slug");
  });

  it("handles mixed spaces, underscores, and special chars", () => {
    expect(generateSlug("Hello_World @ 2024!")).toBe("hello-world-2024");
  });
});

// =============================================================================
// makeSlugUnique
// =============================================================================

describe("makeSlugUnique", () => {
  it("returns base slug when there are no conflicts", () => {
    expect(makeSlugUnique("hello-world", [])).toBe("hello-world");
  });

  it("returns base slug when existing slugs don't include it", () => {
    expect(makeSlugUnique("hello-world", ["other-slug"])).toBe("hello-world");
  });

  it("appends -2 when base slug conflicts", () => {
    expect(makeSlugUnique("hello-world", ["hello-world"])).toBe(
      "hello-world-2",
    );
  });

  it("appends -3 when base and -2 both conflict", () => {
    expect(
      makeSlugUnique("hello-world", ["hello-world", "hello-world-2"]),
    ).toBe("hello-world-3");
  });

  it("finds the next available number with many conflicts", () => {
    const existing = [
      "slug",
      "slug-2",
      "slug-3",
      "slug-4",
      "slug-5",
    ];
    expect(makeSlugUnique("slug", existing)).toBe("slug-6");
  });
});
