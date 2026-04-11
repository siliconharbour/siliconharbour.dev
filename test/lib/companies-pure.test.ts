import { describe, it, expect } from "vitest";
import { parseGitHubCompanyField, extractCompanyFromBio } from "~/lib/companies.server";

// =============================================================================
// NOTE: normalizeCompanyName and similarityScore are private (not exported).
// We can only test them indirectly through the exported functions that use them,
// or through findCompanyByFuzzyName (which requires DB).
// The tests below cover the two exported pure functions.
// =============================================================================

// =============================================================================
// parseGitHubCompanyField
// =============================================================================

describe("parseGitHubCompanyField", () => {
  it("parses @orgname format into name + GitHub URL", () => {
    const result = parseGitHubCompanyField("@myorg");
    expect(result).toEqual({
      name: "myorg",
      githubOrg: "https://github.com/myorg",
    });
  });

  it("parses @orgname with leading/trailing whitespace", () => {
    const result = parseGitHubCompanyField("  @spacedorg  ");
    expect(result).toEqual({
      name: "spacedorg",
      githubOrg: "https://github.com/spacedorg",
    });
  });

  it("parses https://github.com/orgname URL", () => {
    const result = parseGitHubCompanyField("https://github.com/coolorg");
    expect(result).toEqual({
      name: "coolorg",
      githubOrg: "https://github.com/coolorg",
    });
  });

  it("parses http://github.com URL (case insensitive)", () => {
    const result = parseGitHubCompanyField("http://GitHub.com/SomeOrg");
    expect(result).toEqual({
      name: "SomeOrg",
      githubOrg: "https://github.com/SomeOrg",
    });
  });

  it("extracts only the org from a GitHub URL with extra path segments", () => {
    const result = parseGitHubCompanyField("https://github.com/orgname/repo/tree/main");
    expect(result).toEqual({
      name: "orgname",
      githubOrg: "https://github.com/orgname",
    });
  });

  it("returns plain company name with null githubOrg", () => {
    const result = parseGitHubCompanyField("Acme Corp");
    expect(result).toEqual({
      name: "Acme Corp",
      githubOrg: null,
    });
  });

  it("trims whitespace from plain company name", () => {
    const result = parseGitHubCompanyField("  Acme Corp  ");
    expect(result).toEqual({
      name: "Acme Corp",
      githubOrg: null,
    });
  });

  it("handles empty string", () => {
    const result = parseGitHubCompanyField("");
    expect(result).toEqual({
      name: "",
      githubOrg: null,
    });
  });

  it("handles whitespace-only string", () => {
    const result = parseGitHubCompanyField("   ");
    expect(result).toEqual({
      name: "",
      githubOrg: null,
    });
  });
});

// =============================================================================
// extractCompanyFromBio
// =============================================================================

describe("extractCompanyFromBio", () => {
  it('extracts company from "Role at Company" pattern', () => {
    const result = extractCompanyFromBio("Software Engineer at Verafin");
    expect(result).toBe("Verafin");
  });

  it('extracts company from "Staff Engineer at CoLab Software"', () => {
    const result = extractCompanyFromBio("Staff Engineer at CoLab Software");
    expect(result).toBe("CoLab Software");
  });

  it('extracts company from "Developer at Acme Inc."', () => {
    // The pattern captures up to the period
    const result = extractCompanyFromBio("Developer at Acme Inc.");
    expect(result).not.toBeNull();
    expect(result).toContain("Acme");
  });

  it('extracts company from "working at SomeCompany"', () => {
    const result = extractCompanyFromBio("I am working at SomeCompany");
    expect(result).toBe("SomeCompany");
  });

  it('extracts company from "employed at BigCorp"', () => {
    const result = extractCompanyFromBio("Currently employed at BigCorp");
    expect(result).toBe("BigCorp");
  });

  it('extracts company from "work for TechCo"', () => {
    const result = extractCompanyFromBio("I work for TechCo");
    expect(result).toBe("TechCo");
  });

  it("returns null when no company pattern is found", () => {
    const result = extractCompanyFromBio("I love open source and building things");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = extractCompanyFromBio("");
    expect(result).toBeNull();
  });

  it("handles bio with company name containing ampersand", () => {
    const result = extractCompanyFromBio("Engineer at Johnson & Johnson");
    expect(result).toBe("Johnson & Johnson");
  });

  it('handles "at Company" at the start of a sentence', () => {
    const result = extractCompanyFromBio("Currently at Google working on cool stuff");
    expect(result).not.toBeNull();
    expect(result).toContain("Google");
  });

  it("extracts company when bio has parenthetical after company name", () => {
    const result = extractCompanyFromBio("Engineer at Verafin (now Nasdaq)");
    expect(result).toBe("Verafin");
  });
});
