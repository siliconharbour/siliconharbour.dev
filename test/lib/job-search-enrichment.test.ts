import { describe, expect, it } from "vitest";
import {
  __testables,
  enrichJobSearchResultsFromRows,
} from "../../app/lib/job-search-enrichment.server";
import type { IndeedSearchResult } from "../../app/lib/job-search.server";

const result: IndeedSearchResult = {
  id: "in-1",
  title: "Senior Software Developer",
  companyName: "Example Inc.",
  location: "St. John's, NL",
  description: "Build software.",
  descriptionHtml: "<p>Build software.</p>",
  url: "https://ca.indeed.com/viewjob?jk=1",
  directUrl: "https://example.bamboohr.com/careers/42",
  salary: null,
  datePosted: "2026-08-29",
  isRemote: false,
  attributes: [],
};

const rows = {
  companies: [{ id: 7, name: "Example", slug: "example", visible: true }],
  jobs: [
    {
      id: 12,
      companyId: 7,
      title: "Senior Software Developer",
      url: "https://example.bamboohr.com/careers/42",
      status: "pending_review",
    },
  ],
  sources: [
    {
      id: 3,
      companyId: 7,
      sourceType: "bamboohr",
      sourceIdentifier: "example",
      sourceUrl: "https://example.bamboohr.com/careers",
    },
  ],
};

describe("job search enrichment", () => {
  it("matches company aliases, existing jobs, sources, and direct ATS URLs", () => {
    const [enriched] = enrichJobSearchResultsFromRows([result], rows);

    expect(enriched.match).toEqual({
      companyId: 7,
      companySlug: "example",
      companyVisible: true,
      companyConfidence: "normalized",
      existingJobId: 12,
      existingJobStatus: "pending_review",
      duplicateConfidence: "exact_url",
      likelyDuplicate: true,
      companyHasJobSource: true,
      jobSources: [
        {
          id: 3,
          sourceType: "bamboohr",
          sourceIdentifier: "example",
          sourceUrl: "https://example.bamboohr.com/careers",
        },
      ],
    });
    expect(enriched.discoveredSource).toEqual({
      sourceType: "bamboohr",
      sourceIdentifier: "example",
      sourceUrl: "https://example.bamboohr.com/careers/42",
      confidence: "high",
    });
  });

  it("uses company and normalized title as a conservative duplicate fallback", () => {
    const [enriched] = enrichJobSearchResultsFromRows(
      [{ ...result, directUrl: null, url: "https://linkedin.com/jobs/view/1" }],
      rows,
    );

    expect(enriched.match.existingJobId).toBe(12);
    expect(enriched.match.duplicateConfidence).toBe("company_title");
    expect(enriched.discoveredSource).toBeNull();
  });

  it("does not claim a match from title alone when the company is unknown", () => {
    const [enriched] = enrichJobSearchResultsFromRows(
      [{ ...result, companyName: "Different Business", directUrl: null }],
      rows,
    );

    expect(enriched.match.companyId).toBeNull();
    expect(enriched.match.likelyDuplicate).toBe(false);
  });

  it.each([
    ["https://jobs.ashbyhq.com/spellbook.com/abc", "ashby", "spellbook.com", "high"],
    [
      "https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=abc&ccId=123&lang=en_CA",
      "adp",
      "abc:123:en_CA",
      "high",
    ],
    ["https://boards.greenhouse.io/colabsoftware/jobs/1", "greenhouse", "colabsoftware", "high"],
    ["https://nasdaq.wd1.myworkdayjobs.com/en-US/site/job/1", "workday", null, "medium"],
    ["https://careers.subsea7.com/job/St-Johns-Designer/123/", "successfactors", "careers.subsea7.com", "medium"],
  ])("detects ATS source information from %s", (url, sourceType, identifier, confidence) => {
    expect(__testables.detectAts(url)).toMatchObject({
      sourceType,
      sourceIdentifier: identifier,
      confidence,
    });
  });
});
