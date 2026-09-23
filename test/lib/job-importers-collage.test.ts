import { afterEach, expect, it, vi } from "vitest";
import { collageImporter } from "../../app/lib/job-importers/collage.server";

afterEach(() => vi.restoreAllMocks());

it("reads locations separated by Collage's visual bullet elements", async () => {
  const listing = `
    <div class="ATS-posting">
      <h1 class="ATS-department">Engineering</h1>
      <a href="/jobs/nordspace/65338">
        <div class="ATS-position-title">Infrastructure Engineer</div>
        <span class="ATS-commitment-and-location">Full Time<span class="ATS-bullet-point"></span>St. John's, NL</span>
      </a>
      <a href="/jobs/nordspace/65000">
        <div class="ATS-position-title">Fluids Engineer</div>
        <span class="ATS-commitment-and-location">Full Time<span class="ATS-bullet-point"></span>Markham, ON</span>
      </a>
    </div>`;
  const detail = `<h1 class="ATS-position-title-main">Engineer</h1><div class="ATS-position-description"><p>Build systems.</p></div>`;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
    ({ ok: true, text: async () => String(url).endsWith("/jobs/nordspace") ? listing : detail }) as Response,
  );

  const jobs = await collageImporter.fetchJobs({
    id: 1,
    companyId: 330,
    sourceType: "collage",
    sourceIdentifier: "nordspace",
    sourceUrl: null,
  });

  expect(jobs.map((job) => job.location)).toEqual(["St. John's, NL", "Markham, ON"]);
});
