import { describe, expect, it } from "vitest";
import {
  findExistingTechNLJob,
  normalizeJobTitle,
  parseTechNLFeed,
} from "~/lib/technl-jobs.server";

describe("TechNL jobs", () => {
  it("normalizes cosmetic title differences for conservative company/title matching", () => {
    expect(normalizeJobTitle("Senior Developer, Data & ML")).toBe(
      normalizeJobTitle("Senior Developer - Data and ML"),
    );
  });

  it("keeps meaningfully different titles distinct", () => {
    expect(normalizeJobTitle("Account Executive - Insurance")).not.toBe(
      normalizeJobTitle("Account Executive"),
    );
  });

  it("matches a different URL only when company and normalized title agree", () => {
    const candidates = [
      {
        id: 12,
        companyId: 7,
        title: "Senior Developer, Data & ML",
        url: "https://example.com/jobs/12",
        status: "active",
      },
    ];

    expect(
      findExistingTechNLJob(
        {
          link: "https://technl.ca/job/12",
          title: "Senior Developer - Data and ML",
        },
        7,
        candidates,
      ),
    ).toMatchObject({ confidence: "company_title", job: { id: 12 } });
    expect(
      findExistingTechNLJob(
        { link: "https://technl.ca/job/12", title: "Senior Developer - Data and ML" },
        8,
        candidates,
      ),
    ).toEqual({ confidence: null, job: null });
  });

  it("prefers an exact URL match without requiring a company match", () => {
    const result = findExistingTechNLJob(
      { link: "https://technl.ca/job/12", title: "Different title" },
      null,
      [
        {
          id: 12,
          companyId: 7,
          title: "Senior Developer",
          url: "https://technl.ca/job/12",
          status: "active",
        },
      ],
    );

    expect(result).toMatchObject({ confidence: "exact_url", job: { id: 12 } });
  });

  it("parses namespaced feed fields and ignores incomplete entries", () => {
    const [job] = parseTechNLFeed(`
      <rss xmlns:content="http://purl.org/rss/1.0/modules/content/"
           xmlns:job_listing="https://wpjobmanager.com/rss/">
        <channel>
          <item>
            <title>Developer &amp;amp; Analyst</title>
            <link>https://technl.ca/job/example</link>
            <content:encoded><![CDATA[<p>Build useful things.</p>]]></content:encoded>
            <job_listing:company>Example Inc.</job_listing:company>
            <job_listing:location>St. John's, NL</job_listing:location>
            <job_listing:job_type>Full Time</job_listing:job_type>
          </item>
          <item><title>Missing link</title></item>
        </channel>
      </rss>
    `);

    expect(job).toMatchObject({
      title: "Developer & Analyst",
      company: "Example Inc.",
      location: "St. John's, NL",
      jobType: "Full Time",
      descriptionText: "Build useful things.",
    });
  });
});
