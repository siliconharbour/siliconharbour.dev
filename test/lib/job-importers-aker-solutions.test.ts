import { describe, expect, it } from "vitest";
import { parseAkerSolutionsFeed } from "~/lib/job-importers/custom/aker-solutions";

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<Job-Listing>
  <Job>
    <JobTitle><![CDATA[Structural &amp; Electrical Designer]]></JobTitle>
    <Job-Description><![CDATA[<p>Join our St. John's, NL office.</p>]]></Job-Description>
    <ReqId>21815</ReqId>
    <filter7><label>Country</label><value>Canada</value></filter7>
  </Job>
  <Job>
    <JobTitle><![CDATA[Rope Access Technician]]></JobTitle>
    <Job-Description><![CDATA[<p>Join our offshore team.</p>]]></Job-Description>
    <ReqId>21165</ReqId>
    <filter7><label>Country</label><value>Canada</value></filter7>
  </Job>
  <Job>
    <JobTitle><![CDATA[Developer]]></JobTitle>
    <Job-Description><![CDATA[<p>Based in St. John's.</p>]]></Job-Description>
    <ReqId>21999</ReqId>
    <filter7><label>Country</label><value>Norway</value></filter7>
  </Job>
</Job-Listing>`;

describe("Aker Solutions XML feed", () => {
  it("keeps St. John's jobs with their existing external IDs and official application links", () => {
    expect(parseAkerSolutionsFeed(feed)).toEqual([
      {
        externalId: "jobpost-21815",
        title: "Structural & Electrical Designer",
        location: "St. John's, Canada",
        url: "https://career2.successfactors.eu/sfcareer/jobreqcareer?jobId=21815&company=akersoluti",
      },
    ]);
  });

  it("rejects an unexpected or empty feed before sync can remove jobs", () => {
    expect(() => parseAkerSolutionsFeed("<html>Access denied</html>")).toThrow(
      /unexpected format/,
    );
    expect(() => parseAkerSolutionsFeed("<Job-Listing />")).toThrow(/no jobs/);
  });
});
