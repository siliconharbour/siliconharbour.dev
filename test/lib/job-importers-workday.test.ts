import { afterEach, describe, expect, it, vi } from "vitest";
import { workdayImporter } from "../../app/lib/job-importers/workday.server";

describe("workday importer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses Workday's maximum page size and paginates", async () => {
    const listing = (id: string) => ({
      title: `Job ${id}`,
      externalPath: `/job/St-Johns/Job-${id}_${id}`,
      locationsText: "Canada - St. John's",
      postedOn: "Posted Today",
      bulletFields: [id],
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.method !== "POST") {
        return new Response("unavailable", { status: 503 });
      }

      const body = JSON.parse(String(init.body)) as { limit: number; offset: number };
      return Response.json({
        total: 2,
        jobPostings: body.offset === 0 ? [listing("R1")] : [listing("R2")],
      });
    });

    const jobs = await workdayImporter.fetchJobs({
      id: 1,
      companyId: 1,
      sourceType: "workday",
      sourceIdentifier: "nasdaq:Global_External_Site:verafin",
      sourceUrl: null,
    });

    const listingRequests = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(listingRequests).toHaveLength(2);
    expect(
      listingRequests.map(([, init]) => JSON.parse(String(init?.body)) as object),
    ).toEqual([
      { appliedFacets: {}, limit: 20, offset: 0, searchText: "verafin" },
      { appliedFacets: {}, limit: 20, offset: 1, searchText: "verafin" },
    ]);
    expect(jobs.map((job) => job.externalId)).toEqual(["R1", "R2"]);
  });
});
