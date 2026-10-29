import { describe, it, expect } from "vitest";
import {
  companyToMarkdown,
  eventToMarkdown,
  projectToMarkdown,
  markdownResponse,
} from "~/lib/markdown.server";

function extractFrontmatter(md: string): string {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : "";
}

function parseFrontmatterLines(fm: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    // Skip array items (  - value) and nested keys (  key: value)
    if (line.startsWith("  ")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

describe("formatFrontmatter via companyToMarkdown", () => {
  const baseCompany = {
    id: 1,
    slug: "acme",
    name: "Acme Corp",
    description: "A test company",
    website: "https://acme.example.com",
    externalLinks: null,
    careersUrl: null,
    location: "St. John's",
    founded: "2020",
    logo: null,
    hidden: false,
    visible: true,
    technl: false,
    technlExternalId: null,
    technlLastSeenAt: null,
    genesisExternalId: null,
    genesisLastSeenAt: null,
    bounceExternalId: null,
    bounceLastSeenAt: null,
    genesis: false,
    bounce: false,
    newsFilterInclude: false,
    email: null,
    coverImage: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };

  it("generates valid frontmatter delimiters", () => {
    const md = companyToMarkdown(baseCompany);
    expect(md).toMatch(/^---\n/);
    expect(md).toMatch(/\n---\n/);
  });

  it("exports the external link object and omits it when absent", () => {
    const links = {
      github: "https://github.com/acme",
      linkedin: "https://linkedin.com/company/acme",
      wikipedia: "https://en.wikipedia.org/wiki/Acme",
    };
    const frontmatter = extractFrontmatter(
      companyToMarkdown({ ...baseCompany, externalLinks: links }),
    );
    expect(frontmatter).toContain("external_links:");
    for (const [key, value] of Object.entries(links))
      expect(frontmatter).toContain(`  ${key}: ${value}`);
    expect(extractFrontmatter(companyToMarkdown(baseCompany))).not.toContain("external_links:");
  });

  it("simple string values appear without quotes", () => {
    const fm = extractFrontmatter(companyToMarkdown(baseCompany));
    const lines = parseFrontmatterLines(fm);
    expect(lines["name"]).toBe("Acme Corp");
    expect(lines["slug"]).toBe("acme");
  });

  it("null values are skipped", () => {
    const fm = extractFrontmatter(companyToMarkdown(baseCompany));
    expect(fm).not.toContain("wikipedia:");
    expect(fm).not.toContain("github:");
    expect(fm).not.toContain("logo:");
  });

  it("value with colon is quoted", () => {
    // URLs contain colons — they should be quoted
    const fm = extractFrontmatter(companyToMarkdown(baseCompany));
    // website has a colon in the URL — it should be in quotes
    expect(fm).toMatch(/website: "https:\/\//);
  });

  it("boolean values appear as true/false", () => {
    // requiresSignup is a boolean field in events
    const event = {
      id: 1,
      slug: "test",
      title: "Test",
      description: "Desc",
      location: "Here",
      link: "https://example.com",
      organizer: "Org",
      coverImage: null,
      iconImage: null,
      coverImageUrl: null,
      requiresSignup: true,
      timeMode: "scheduled" as const,
      parentEventId: null,
      recurrenceRule: null,
      recurrenceStart: null,
      recurrenceEnd: null,
      defaultStartTime: null,
      defaultEndTime: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      importSourceId: null,
      externalId: null,
      importStatus: null,
      firstSeenAt: null,
      lastSeenAt: null,
      dates: [],
    };
    const fm = extractFrontmatter(eventToMarkdown(event));
    expect(fm).toContain("requires_signup: true");
  });

  it("number values appear as numbers", () => {
    const fm = extractFrontmatter(companyToMarkdown(baseCompany));
    expect(fm).toContain("id: 1");
  });

  it("array values render as YAML list items", () => {
    const techs = [
      { name: "TypeScript", slug: "typescript", category: "Language" },
      { name: "React", slug: "react", category: "Framework" },
    ];
    const fm = extractFrontmatter(companyToMarkdown(baseCompany, techs));
    expect(fm).toContain("technologies:");
    expect(fm).toContain("  - TypeScript");
    expect(fm).toContain("  - React");
  });

  it("empty array values are skipped", () => {
    const fm = extractFrontmatter(companyToMarkdown(baseCompany, []));
    expect(fm).not.toContain("technologies:");
  });
});

describe("formatFrontmatter string escaping", () => {
  it("value with double quotes is escaped", () => {
    const company = {
      id: 2,
      slug: "quote-co",
      name: 'The "Best" Company',
      description: "desc",
      website: null,
      externalLinks: null,
      careersUrl: null,
      location: null,
      founded: null,
      logo: null,
      hidden: false,
      visible: true,
      technl: false,
      technlExternalId: null,
      technlLastSeenAt: null,
      genesisExternalId: null,
      genesisLastSeenAt: null,
      bounceExternalId: null,
      bounceLastSeenAt: null,
      genesis: false,
      bounce: false,
      newsFilterInclude: false,
      email: null,
      coverImage: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const fm = extractFrontmatter(companyToMarkdown(company));
    // The name has quotes so should be wrapped in quotes with escaped internal quotes
    expect(fm).toContain('name: "The \\"Best\\" Company"');
  });

  it("value with newline is escaped", () => {
    // Use description field via jobToMarkdown which passes description through frontmatter
    // Actually description is body content, not frontmatter. Let's use excerpt via news.
    // For a reliable test, use a job with salaryRange that contains a newline
    // Actually the simplest way is to test via a company name with newline
    const company = {
      id: 3,
      slug: "newline-co",
      name: "Line One\nLine Two",
      description: "desc",
      website: null,
      externalLinks: null,
      careersUrl: null,
      location: null,
      founded: null,
      logo: null,
      hidden: false,
      visible: true,
      technl: false,
      technlExternalId: null,
      technlLastSeenAt: null,
      genesisExternalId: null,
      genesisLastSeenAt: null,
      bounceExternalId: null,
      bounceLastSeenAt: null,
      genesis: false,
      bounce: false,
      newsFilterInclude: false,
      email: null,
      coverImage: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const fm = extractFrontmatter(companyToMarkdown(company));
    // Newlines in values should be escaped as \n within quotes
    expect(fm).toContain('name: "Line One\\nLine Two"');
  });

  it("value with colon is wrapped in quotes", () => {
    const company = {
      id: 4,
      slug: "colon-co",
      name: "Company: The Sequel",
      description: "desc",
      website: null,
      externalLinks: null,
      careersUrl: null,
      location: null,
      founded: null,
      logo: null,
      hidden: false,
      visible: true,
      technl: false,
      technlExternalId: null,
      technlLastSeenAt: null,
      genesisExternalId: null,
      genesisLastSeenAt: null,
      bounceExternalId: null,
      bounceLastSeenAt: null,
      genesis: false,
      bounce: false,
      newsFilterInclude: false,
      email: null,
      coverImage: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const fm = extractFrontmatter(companyToMarkdown(company));
    expect(fm).toContain('name: "Company: The Sequel"');
  });
});

describe("formatFrontmatter nested objects", () => {
  it("object values render as nested YAML keys", () => {
    // personToMarkdown passes externalLinks as a nested object
    // We can't easily test personToMarkdown without the full type,
    // but we can test via projectToMarkdown with links
    const project = {
      id: 1,
      slug: "test-project",
      name: "Test Project",
      description: "A test project",
      type: "library" as const,
      status: "active" as const,
      logo: null,
      links: { github: "https://github.com/test", website: "https://docs.test" },
      hidden: false,
      visible: true,
      technl: false,
      technlExternalId: null,
      technlLastSeenAt: null,
      genesisExternalId: null,
      genesisLastSeenAt: null,
      bounceExternalId: null,
      bounceLastSeenAt: null,
      genesis: false,
      bounce: false,
      newsFilterInclude: false,
      email: null,
      coverImage: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const fm = extractFrontmatter(projectToMarkdown(project));
    expect(fm).toContain("links:");
    expect(fm).toContain("  github: https://github.com/test");
    expect(fm).toContain("  website: https://docs.test");
  });
});

describe("formatFrontmatter date handling", () => {
  it("Date objects are serialized as ISO strings", () => {
    const company = {
      id: 5,
      slug: "date-co",
      name: "Date Co",
      description: "desc",
      website: null,
      externalLinks: null,
      careersUrl: null,
      location: null,
      founded: null,
      logo: null,
      hidden: false,
      visible: true,
      technl: false,
      technlExternalId: null,
      technlLastSeenAt: null,
      genesisExternalId: null,
      genesisLastSeenAt: null,
      bounceExternalId: null,
      bounceLastSeenAt: null,
      genesis: false,
      bounce: false,
      newsFilterInclude: false,
      email: null,
      coverImage: null,
      createdAt: new Date("2026-06-15T10:30:00Z"),
      updatedAt: new Date("2026-06-15T10:30:00Z"),
    };
    const fm = extractFrontmatter(companyToMarkdown(company));
    // updatedAt should be an ISO timestamp string
    expect(fm).toMatch(/updated_at: \d{4}-\d{2}-\d{2}T/);
  });
});

describe("markdownResponse", () => {
  it("returns a Response with text/markdown content type", () => {
    const res = markdownResponse("# Hello");
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
  });

  it("sets X-Content-Type-Options: nosniff", () => {
    const res = markdownResponse("# Hello");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
