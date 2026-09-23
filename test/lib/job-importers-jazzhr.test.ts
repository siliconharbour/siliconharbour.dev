import { afterEach, expect, it, vi } from "vitest";
import { jazzhrImporter } from "../../app/lib/job-importers/jazzhr.server";

afterEach(() => vi.restoreAllMocks());

it("imports JazzHR listings with stable IDs, locations, and full descriptions", async () => {
  const listing = `
    <li class="list-group-item">
      <h3 class="list-group-item-heading"><a href="https://fonemed.applytojob.com/apply/2eP6IqhZEf/Project-Manager">Project Manager</a></h3>
      <ul class="list-group-item-text"><li>St. John's, NL, Canada</li></ul>
    </li>
    <li class="list-group-item">
      <h3 class="list-group-item-heading"><a href="https://fonemed.applytojob.com/apply/abc123/Nurse-Practitioner">Nurse Practitioner</a></h3>
      <ul class="list-group-item-text"><li>Remote</li></ul>
    </li>`;
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (url) =>
      ({
        ok: true,
        text: async () =>
          String(url).endsWith("/apply")
            ? listing
            : `<div id="job-description"><p>Work with patients and software.</p></div>`,
      }) as Response,
  );

  const jobs = await jazzhrImporter.fetchJobs({
    id: 1,
    companyId: 80,
    sourceType: "jazzhr",
    sourceIdentifier: "fonemed",
    sourceUrl: null,
  });

  expect(
    jobs.map(({ externalId, location, workplaceType }) => ({
      externalId,
      location,
      workplaceType,
    })),
  ).toEqual([
    { externalId: "2eP6IqhZEf", location: "St. John's, NL, Canada", workplaceType: undefined },
    { externalId: "abc123", location: "Remote", workplaceType: "remote" },
  ]);
  expect(jobs[0]?.descriptionText).toBe("Work with patients and software.");
});
