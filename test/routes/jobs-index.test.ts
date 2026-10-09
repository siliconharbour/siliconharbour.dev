import { describe, expect, it, vi } from "vitest";
import { db } from "~/db";
import { companies, jobs, type NewJob } from "~/db/schema";
import * as jobQueries from "~/lib/jobs.server";
import { loader } from "~/routes/jobs/index";

vi.mock("~/lib/session.server", () => ({ getOptionalUser: async () => null }));

async function load(query = "") {
  return loader({ request: new Request(`https://example.com/jobs${query}`) } as Parameters<
    typeof loader
  >[0]);
}

function seed() {
  db.insert(companies)
    .values([
      { id: 1, name: "Acme", slug: "acme", description: "", logo: "acme.png" },
      { id: 2, name: "Beta", slug: "beta", description: "" },
    ])
    .run();
  db.insert(jobs)
    .values(
      (
        [
          {
            id: 1,
            companyId: 1,
            title: "Older engineer",
            slug: "older",
            workplaceType: "remote",
            firstSeenAt: new Date("2026-01-01"),
            createdAt: new Date("2026-03-01"),
            postedAt: new Date("2026-04-01"),
          },
          {
            id: 2,
            companyId: 2,
            title: "Newer engineer",
            slug: "newer",
            workplaceType: "hybrid",
            firstSeenAt: new Date("2026-02-01"),
            createdAt: new Date("2026-02-01"),
          },
          {
            id: 3,
            companyId: 1,
            title: "Manual engineer",
            slug: "manual",
            workplaceType: "remote",
            createdAt: new Date("2026-03-01"),
          },
          { id: 4, companyId: 1, title: "Designer", slug: "designer", isTechnical: false },
          { id: 5, companyId: 2, title: "Closed engineer", slug: "closed", status: "removed" },
        ] satisfies NewJob[]
      ).map((job) => ({
        firstSeenAt: new Date("2026-03-01"),
        lastSeenAt: new Date("2026-03-01"),
        ...job,
      })),
    )
    .run();
}

describe("jobs listing", () => {
  it("orders across companies by first seen, falls back to created, and excludes inactive and nontechnical jobs", async () => {
    seed();
    const grouped = await jobQueries.getJobsGroupedByCompany();
    grouped.flatMap(({ jobs }) => jobs).find((job) => job.id === 3)!.firstSeenAt = null;
    vi.spyOn(jobQueries, "getJobsGroupedByCompany").mockResolvedValueOnce(grouped);
    const result = await load("?sort=newest");
    expect(result.newestJobs.map(({ job }) => job.id)).toEqual([3, 2, 1]);
    expect(result.totalJobs).toBe(3);
  });

  it("combines company, search and workplace filters while keeping company options available", async () => {
    seed();
    const result = await load("?company=acme&q=engineer&workplace=remote&sort=newest");
    expect(result.newestJobs.map(({ job }) => job.id)).toEqual([3, 1]);
    expect(result.companyOptions.map(({ value }) => value)).toEqual(["acme", "beta"]);
    const multiple = await load("?company=acme|beta&sort=newest");
    expect(multiple.newestJobs.map(({ job }) => job.id)).toEqual([3, 2, 1]);
    expect(multiple.companyOptions[0].imageSrc).toBe("/images/acme.png");
    expect((await load("?company=")).totalJobs).toBe(3);
    expect((await load("?company=acme&technical=false")).totalJobs).toBe(3);
    const unavailable = await load("?company=missing");
    expect(unavailable.totalJobs).toBe(0);
    expect(unavailable.companyOptions).toContainEqual({
      value: "missing",
      label: "Unavailable company (missing)",
      imageSrc: undefined,
    });
  });
});
