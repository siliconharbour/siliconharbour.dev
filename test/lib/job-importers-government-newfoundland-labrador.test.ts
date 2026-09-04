import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGnlTechnicalMatchReason,
  parseGnlCompetitionDetail,
  parseGnlCompetitionFeed,
  scrapeGovernmentNewfoundlandLabrador,
  type GnlCompetitionSummary,
} from "../../app/lib/job-importers/custom/government-newfoundland-labrador";

function competition(overrides: Partial<GnlCompetitionSummary> = {}): GnlCompetitionSummary {
  return {
    id: 32872,
    compNumber: "OCIO.CON.26.27.0488",
    isInternal: false,
    isCancelled: false,
    closingDate: "2026-09-14T00:00:00",
    jobTitle: "AI Solutions Engineer",
    employer: "Design and Delivery",
    parentEmployer: "Office of the Chief Information Officer",
    status: "Posted",
    statusChangeDate: "2026-09-02T10:54:41.117",
    salary: "$70,726 - $91,943 per annum",
    locations: [{ locationId: 56, locationName: "St. John's" }],
    positions: [
      {
        positionTypeId: 3,
        positionType: "Contract",
        numberOfPositions: 1,
        showCount: true,
      },
    ],
    jobCategories: [
      {
        jobCategoryId: 34,
        jobCategoryName: "Information Technology and Information Management",
      },
    ],
    ...overrides,
  };
}

function detailHtml(title: string): string {
  return `
    <div class="competition-details competition-detail-page">
      <div class="section header competition-listing-condensed"><h1>${title}</h1></div>
      <div class="section competition-detail-expaneded">
        <p><strong>Competition Number:</strong> OCIO.CON.26.27.0488</p>
        <p><strong>Posted Date:</strong> September 2, 2026</p>
        <p><strong>Closing Date:</strong> September 14, 2026</p>
        <p><strong>Location:</strong> St. John's</p>
      </div>
      <div class="section">
        <h2>Position Details</h2>
        <p>Build secure public-service technology.</p>
        <a href="/html/accommodations">Accommodations</a>
      </div>
      <div class="section"><h2>Screening Criteria</h2><ol><li>Technology experience</li></ol></div>
      <div class="apply-now"><a href="/Applications/Submit/32872/test">Apply Now</a></div>
    </div>`;
}

describe("Government of Newfoundland and Labrador job importer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the official IT category even when a title is generic", () => {
    expect(getGnlTechnicalMatchReason(competition({ jobTitle: "Delivery Manager" }))).toBe(
      "official-it-category",
    );
  });

  it("includes clearly technical titles when the source category is wrong", () => {
    expect(
      getGnlTechnicalMatchReason(
        competition({
          jobTitle: "Software Developer",
          parentEmployer: "Department of Finance",
          employer: "Corporate Services",
          jobCategories: [{ jobCategoryId: 1, jobCategoryName: "Administration" }],
        }),
      ),
    ).toBe("technical-title");
  });

  it.each([
    "Network Administrator",
    "Data Analyst",
    "Computer Support Specialist",
    "Enterprise Solutions Architect",
    "Infrastructure Engineer",
    "Business Intelligence Analyst",
    "Scrum Master",
    "Telecommunications Specialist",
  ])("includes the technical fallback title %s", (jobTitle) => {
    expect(
      getGnlTechnicalMatchReason(
        competition({
          jobTitle,
          parentEmployer: "Department of Finance",
          employer: "Corporate Services",
          jobCategories: [{ jobCategoryId: 1, jobCategoryName: "Administration" }],
        }),
      ),
    ).toBe("technical-title");
  });

  it("includes technical communications infrastructure roles", () => {
    expect(
      getGnlTechnicalMatchReason(
        competition({
          jobTitle: "Manager of Operations",
          parentEmployer: "Department of Forestry, Agriculture and Lands",
          employer: "Provincial Radio Communications Office (PS Infrastructure)",
          jobCategories: [{ jobCategoryId: 4, jobCategoryName: "Natural Resources" }],
        }),
      ),
    ).toBe("technical-organization");
  });

  it.each([
    "Senior Engineer",
    "Marine Engineer Second Class",
    "Heavy Equipment Technician",
    "Automotive Technician",
    "Design Approval Technician IIB",
    "Mechanical Systems Engineer",
  ])("does not mistake %s for an IT role", (jobTitle) => {
    expect(
      getGnlTechnicalMatchReason(
        competition({
          jobTitle,
          parentEmployer: "Department of Transportation and Infrastructure",
          employer: "Equipment Maintenance",
          jobCategories: [{ jobCategoryId: 20, jobCategoryName: "Technical and Trades" }],
        }),
      ),
    ).toBeNull();
  });

  it("does not include administrative support merely because it works in the OCIO", () => {
    expect(
      getGnlTechnicalMatchReason(
        competition({
          jobTitle: "Administrative Assistant",
          jobCategories: [{ jobCategoryId: 1, jobCategoryName: "Administration" }],
        }),
      ),
    ).toBeNull();
  });

  it("parses full detail sections and normalizes source links", () => {
    const result = parseGnlCompetitionDetail(detailHtml("AI Solutions Engineer"), "Fallback title");

    expect(result).toEqual(
      expect.objectContaining({
        title: "AI Solutions Engineer",
        descriptionText: expect.stringContaining("Build secure public-service technology"),
        postedAt: new Date("2026-09-02T00:00:00.000Z"),
      }),
    );
    expect(result.descriptionHtml).toContain(
      'href="https://www.hiring.gov.nl.ca/html/accommodations"',
    );
    expect(result.descriptionHtml).not.toContain("Applications/Submit");
  });

  it("fails loudly when the feed shape changes", () => {
    expect(() => parseGnlCompetitionFeed({ jobs: [] })).toThrow("non-array response");
    expect(() => parseGnlCompetitionFeed([{ id: 1 }])).toThrow("invalid item at index 0");
  });

  it("fetches detail pages only for matching technical competitions", async () => {
    const technical = competition();
    const civil = competition({
      id: 32678,
      compNumber: "TI.26.27.0294",
      jobTitle: "Senior Engineer",
      parentEmployer: "Department of Transportation and Infrastructure",
      employer: "Building Design and Construction Division",
      jobCategories: [{ jobCategoryId: 3, jobCategoryName: "Engineering" }],
    });
    const internal = competition({ id: 40001, isInternal: true });
    const cancelled = competition({ id: 40002, isCancelled: true });
    const inactive = competition({ id: 40003, status: "Closed" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/competitions/public")) {
        return new Response(JSON.stringify([technical, civil, internal, cancelled, inactive]), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/Competitions/Details/32872")) {
        return new Response(detailHtml("AI Solutions Engineer"));
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const jobs = await scrapeGovernmentNewfoundlandLabrador();

    expect(jobs).toEqual([
      expect.objectContaining({
        externalId: "32872",
        title: "AI Solutions Engineer",
        location: "St. John's",
        department: "Office of the Chief Information Officer — Design and Delivery",
        url: "https://www.hiring.gov.nl.ca/Competitions/Details/32872",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
