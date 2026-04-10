import { describe, it, expect } from "vitest";
import {
  parsePagination,
  buildLinkHeader,
  imageUrl,
  contentUrl,
} from "~/lib/api.server";

// =============================================================================
// parsePagination
// =============================================================================

describe("parsePagination", () => {
  it("returns default values when no params are set", () => {
    const url = new URL("https://example.com/api/items");
    const result = parsePagination(url);
    expect(result).toEqual({ limit: 20, offset: 0 });
  });

  it("parses custom limit and offset", () => {
    const url = new URL("https://example.com/api/items?limit=50&offset=10");
    const result = parsePagination(url);
    expect(result).toEqual({ limit: 50, offset: 10 });
  });

  it("clamps limit to max 100", () => {
    const url = new URL("https://example.com/api/items?limit=500");
    const result = parsePagination(url);
    expect(result.limit).toBe(100);
  });

  it("uses default limit for negative values", () => {
    const url = new URL("https://example.com/api/items?limit=-5");
    const result = parsePagination(url);
    expect(result.limit).toBe(20);
  });

  it("uses default limit for NaN values", () => {
    const url = new URL("https://example.com/api/items?limit=abc");
    const result = parsePagination(url);
    expect(result.limit).toBe(20);
  });

  it("resets negative offset to 0", () => {
    const url = new URL("https://example.com/api/items?offset=-10");
    const result = parsePagination(url);
    expect(result.offset).toBe(0);
  });

  it("resets NaN offset to 0", () => {
    const url = new URL("https://example.com/api/items?offset=abc");
    const result = parsePagination(url);
    expect(result.offset).toBe(0);
  });

  it("handles zero offset", () => {
    const url = new URL("https://example.com/api/items?offset=0");
    const result = parsePagination(url);
    expect(result.offset).toBe(0);
  });

  it("uses default limit for zero limit", () => {
    const url = new URL("https://example.com/api/items?limit=0");
    const result = parsePagination(url);
    expect(result.limit).toBe(20);
  });
});

// =============================================================================
// buildLinkHeader
// =============================================================================

describe("buildLinkHeader", () => {
  it("returns next and last links on first page with multiple pages", () => {
    const result = buildLinkHeader(
      "https://example.com/api/items",
      { limit: 20, offset: 0 },
      100,
    );

    expect(result).not.toBeNull();
    expect(result).toContain('rel="next"');
    expect(result).toContain('rel="last"');
    expect(result).not.toContain('rel="prev"');
    expect(result).not.toContain('rel="first"');
    expect(result).toContain("offset=20");
  });

  it("returns first and prev links on last page", () => {
    const result = buildLinkHeader(
      "https://example.com/api/items",
      { limit: 20, offset: 80 },
      100,
    );

    expect(result).not.toBeNull();
    expect(result).toContain('rel="first"');
    expect(result).toContain('rel="prev"');
    expect(result).not.toContain('rel="next"');
    expect(result).not.toContain('rel="last"');
  });

  it("returns all four links on a middle page", () => {
    const result = buildLinkHeader(
      "https://example.com/api/items",
      { limit: 20, offset: 40 },
      100,
    );

    expect(result).not.toBeNull();
    expect(result).toContain('rel="first"');
    expect(result).toContain('rel="prev"');
    expect(result).toContain('rel="next"');
    expect(result).toContain('rel="last"');
  });

  it("returns null when all items fit on one page", () => {
    const result = buildLinkHeader(
      "https://example.com/api/items",
      { limit: 20, offset: 0 },
      10,
    );

    expect(result).toBeNull();
  });

  it("calculates correct prev offset", () => {
    const result = buildLinkHeader(
      "https://example.com/api/items",
      { limit: 20, offset: 40 },
      100,
    );

    // prev should be offset=20
    expect(result).toContain("offset=20");
  });

  it("prev offset does not go below 0", () => {
    const result = buildLinkHeader(
      "https://example.com/api/items",
      { limit: 20, offset: 5 },
      100,
    );

    // prev should be offset=0 (Math.max(0, 5-20) = 0)
    expect(result).toContain("offset=0");
  });
});

// =============================================================================
// imageUrl
// =============================================================================

describe("imageUrl", () => {
  it("returns full image URL for a filename", () => {
    const result = imageUrl("photo.jpg");
    expect(result).toBe("https://siliconharbour.dev/images/photo.jpg");
  });

  it("returns null for null input", () => {
    expect(imageUrl(null)).toBeNull();
  });
});

// =============================================================================
// contentUrl
// =============================================================================

describe("contentUrl", () => {
  it("generates directory URL for companies", () => {
    expect(contentUrl("companies", "verafin")).toBe(
      "https://siliconharbour.dev/directory/companies/verafin",
    );
  });

  it("generates directory URL for people", () => {
    expect(contentUrl("people", "john-doe")).toBe(
      "https://siliconharbour.dev/directory/people/john-doe",
    );
  });

  it("generates directory URL for groups", () => {
    expect(contentUrl("groups", "devnl")).toBe(
      "https://siliconharbour.dev/directory/groups/devnl",
    );
  });

  it("generates directory URL for education", () => {
    expect(contentUrl("education", "mun")).toBe(
      "https://siliconharbour.dev/directory/education/mun",
    );
  });

  it("generates directory URL for projects", () => {
    expect(contentUrl("projects", "cool-app")).toBe(
      "https://siliconharbour.dev/directory/projects/cool-app",
    );
  });

  it("generates directory URL for products", () => {
    expect(contentUrl("products", "saas-tool")).toBe(
      "https://siliconharbour.dev/directory/products/saas-tool",
    );
  });

  it("generates directory URL for technologies", () => {
    expect(contentUrl("technologies", "react")).toBe(
      "https://siliconharbour.dev/directory/technologies/react",
    );
  });

  it("generates root URL for non-directory types like events", () => {
    expect(contentUrl("events", "tech-meetup")).toBe(
      "https://siliconharbour.dev/events/tech-meetup",
    );
  });

  it("generates root URL for news", () => {
    expect(contentUrl("news", "announcement")).toBe(
      "https://siliconharbour.dev/news/announcement",
    );
  });

  it("generates root URL for jobs", () => {
    expect(contentUrl("jobs", "senior-dev")).toBe(
      "https://siliconharbour.dev/jobs/senior-dev",
    );
  });
});
