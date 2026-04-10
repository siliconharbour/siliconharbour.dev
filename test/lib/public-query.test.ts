import { describe, it, expect } from "vitest";
import {
  parsePublicListParams,
  parseEventsQuery,
  parseJobsQuery,
} from "~/lib/public-query.server";

function url(path: string): URL {
  return new URL(path, "https://example.com");
}

// =============================================================================
// parsePublicListParams
// =============================================================================

describe("parsePublicListParams", () => {
  it("returns defaults when no params", () => {
    const result = parsePublicListParams(url("/api/companies"));
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
    expect(result.searchQuery).toBe("");
  });

  it("parses custom limit and offset", () => {
    const result = parsePublicListParams(url("/api/companies?limit=10&offset=5"));
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
  });

  it("parses search query", () => {
    const result = parsePublicListParams(url("/api/companies?q=hello"));
    expect(result.searchQuery).toBe("hello");
  });

  it("clamps limit to max 100", () => {
    const result = parsePublicListParams(url("/api/companies?limit=999"));
    expect(result.limit).toBe(100);
  });

  it("defaults invalid limit to 20", () => {
    const result = parsePublicListParams(url("/api/companies?limit=abc"));
    expect(result.limit).toBe(20);
  });

  it("defaults negative offset to 0", () => {
    const result = parsePublicListParams(url("/api/companies?offset=-5"));
    expect(result.offset).toBe(0);
  });
});

// =============================================================================
// parseEventsQuery
// =============================================================================

describe("parseEventsQuery", () => {
  it("defaults filter to upcoming", () => {
    const result = parseEventsQuery(url("/api/events"));
    expect(result.filter).toBe("upcoming");
    expect(result.dateFilter).toBeUndefined();
  });

  it("parses filter=past", () => {
    const result = parseEventsQuery(url("/api/events?filter=past"));
    expect(result.filter).toBe("past");
  });

  it("parses filter=all", () => {
    const result = parseEventsQuery(url("/api/events?filter=all"));
    expect(result.filter).toBe("all");
  });

  it("parses date filter", () => {
    const result = parseEventsQuery(url("/api/events?date=2025-01-15"));
    expect(result.dateFilter).toBe("2025-01-15");
  });

  it("inherits limit/offset/q from base params", () => {
    const result = parseEventsQuery(url("/api/events?limit=5&offset=10&q=meetup"));
    expect(result.limit).toBe(5);
    expect(result.offset).toBe(10);
    expect(result.searchQuery).toBe("meetup");
  });

  it("throws on invalid filter value", () => {
    expect(() => parseEventsQuery(url("/api/events?filter=invalid"))).toThrow();
  });
});

// =============================================================================
// parseJobsQuery
// =============================================================================

describe("parseJobsQuery", () => {
  it("returns defaults when no params", () => {
    const result = parseJobsQuery(url("/api/jobs"));
    expect(result.searchQuery).toBe("");
    expect(result.showNonTechnical).toBe(false);
    expect(result.selectedWorkplaceTypes).toEqual(["remote", "hybrid", "onsite", "unknown"]);
  });

  it("parses search query", () => {
    const result = parseJobsQuery(url("/api/jobs?q=developer"));
    expect(result.searchQuery).toBe("developer");
  });

  it("technical=false enables showNonTechnical", () => {
    const result = parseJobsQuery(url("/api/jobs?technical=false"));
    expect(result.showNonTechnical).toBe(true);
  });

  it("no technical param means showNonTechnical is false", () => {
    const result = parseJobsQuery(url("/api/jobs"));
    expect(result.showNonTechnical).toBe(false);
  });

  it("parses pipe-separated workplace types", () => {
    const result = parseJobsQuery(url("/api/jobs?workplace=remote|hybrid"));
    expect(result.selectedWorkplaceTypes).toEqual(["remote", "hybrid"]);
  });

  it("filters out invalid workplace types", () => {
    const result = parseJobsQuery(url("/api/jobs?workplace=remote|bogus"));
    expect(result.selectedWorkplaceTypes).toEqual(["remote"]);
  });

  it("defaults to all workplace types when none valid", () => {
    const result = parseJobsQuery(url("/api/jobs?workplace=bogus"));
    expect(result.selectedWorkplaceTypes).toEqual(["remote", "hybrid", "onsite", "unknown"]);
  });

  it("defaults to all workplace types when workplace param is empty", () => {
    const result = parseJobsQuery(url("/api/jobs?workplace="));
    expect(result.selectedWorkplaceTypes).toEqual(["remote", "hybrid", "onsite", "unknown"]);
  });
});
