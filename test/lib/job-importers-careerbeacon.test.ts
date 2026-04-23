import { describe, it, expect, vi, afterEach } from "vitest";
import { __testables, careerbeaconImporter } from "../../app/lib/job-importers/careerbeacon.server";

describe("careerbeacon importer helpers", () => {
  it("extracts job urls from arbitrary text", () => {
    const text = `
      https://www.careerbeacon.com/en/job/2223407/genesis/builder-in-residence/st-john-s-nl
      and https://www.careerbeacon.com/en/job/3333000/example/example-role/remote
    `;

    const urls = __testables.parseJobUrlsFromText(text);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("/job/2223407/");
    expect(urls[1]).toContain("/job/3333000/");
  });

  it("extracts job urls with special characters in path segments", () => {
    const text = `
      https://www.careerbeacon.com/en/job/1234567/st.-john%27s-company/sr.-developer/st.-john%27s-nl
    `;

    const urls = __testables.parseJobUrlsFromText(text);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/job/1234567/");
  });

  it("parses JobPosting schema from a job page", () => {
    const html = `
      <html><body>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Builder-in-Residence","description":"<p>Ship fast.</p>","url":"https://www.careerbeacon.com/en/job/2223407/genesis/builder-in-residence/st-john-s-nl","datePosted":"2026-04-22T10:46:45-04:00","employmentType":["FULL_TIME","CONTRACTOR"],"jobLocationType":"TELECOMMUTE","identifier":{"@type":"PropertyValue","name":"CareerBeacon","value":"2223407"},"jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"St. John's","addressRegion":"NL","addressCountry":"CA"}}}</script>
      </body></html>
    `;

    const posting = __testables.parseCareerBeaconPostingFromHtml(
      html,
      "https://www.careerbeacon.com/en/job/2223407/genesis/builder-in-residence/st-john-s-nl",
    );

    expect(posting.externalId).toBe("2223407");
    expect(posting.title).toBe("Builder-in-Residence");
    expect(posting.location).toBe("St. John's, NL, CA");
    expect(posting.workplaceType).toBe("remote");
  });
});

describe("careerbeacon importer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches jobs from a direct CareerBeacon job URL", async () => {
    const html = `
      <html><body>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Builder-in-Residence","description":"<p>Ship fast.</p>","url":"https://www.careerbeacon.com/en/job/2223407/genesis/builder-in-residence/st-john-s-nl","datePosted":"2026-04-22T10:46:45-04:00","employmentType":"FULL_TIME","identifier":{"@type":"PropertyValue","name":"CareerBeacon","value":"2223407"},"jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"St. John's","addressRegion":"NL","addressCountry":"CA"}}}</script>
      </body></html>
    `;

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => html,
    } as Response);

    const jobs = await careerbeaconImporter.fetchJobs({
      id: 1,
      companyId: 1,
      sourceType: "careerbeacon",
      sourceIdentifier:
        "https://www.careerbeacon.com/en/job/2223407/genesis/builder-in-residence/st-john-s-nl",
      sourceUrl: null,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.externalId).toBe("2223407");
    expect(jobs[0]?.title).toBe("Builder-in-Residence");
  });
});
