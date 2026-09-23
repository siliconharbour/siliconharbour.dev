import { afterEach, expect, it, vi } from "vitest";
import { jazzhrImporter } from "../../app/lib/job-importers/jazzhr.server";

afterEach(() => vi.restoreAllMocks());

it("imports JazzHR listings with stable IDs, locations, and full descriptions", async () => {
  const listing = `
    <li class="list-group-item">
      <h3 class="list-group-item-heading"><a href="https://example.applytojob.com/apply/2eP6IqhZEf/Project-Manager">Project Manager</a></h3>
      <ul class="list-group-item-text"><li>St. John's, NL, Canada</li></ul>
    </li>
    <li class="list-group-item">
      <h3 class="list-group-item-heading"><a href="https://example.applytojob.com/apply/abc123/Nurse-Practitioner">Nurse Practitioner</a></h3>
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
    sourceIdentifier: "example",
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

it("limits a filtered board to Newfoundland technology roles", async () => {
  const listing = [
    [
      "2eP6IqhZEf",
      "Project Manager, Healthcare & Digital Health Solutions",
      "St. John's, NL, Canada",
    ],
    ["clinical123", "Nurse Practitioner", "St. John's, NL, Canada"],
    ["remote123", "Software Developer", "Remote"],
    ["other123", "IT Support Specialist", "Victoria, BC, Canada"],
  ]
    .map(
      ([id, title, location]) => `
    <li class="list-group-item">
      <h3 class="list-group-item-heading"><a href="/apply/${id}/Job">${title}</a></h3>
      <ul class="list-group-item-text"><li>${location}</li></ul>
    </li>`,
    )
    .join("");
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (url) =>
      ({
        ok: true,
        text: async () =>
          String(url).endsWith("/apply")
            ? listing
            : `<div id="job-description"><p>Digital health implementation.</p></div>`,
      }) as Response,
  );

  const config = {
    id: 50,
    companyId: 80,
    sourceType: "jazzhr" as const,
    sourceIdentifier: "fonemed",
    sourceUrl: null,
  };
  const jobs = await jazzhrImporter.fetchJobs(config);

  expect(jobs.map((job) => job.title)).toEqual([
    "Project Manager, Healthcare & Digital Health Solutions",
  ]);
  expect(await jazzhrImporter.validateConfig(config)).toEqual({ valid: true, jobCount: 1 });
});
