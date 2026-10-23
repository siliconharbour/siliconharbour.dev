import { expect, it, vi } from "vitest";
import { db } from "~/db";
import { companies, groups, jobs } from "~/db/schema";
import { operationCatalog } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { loader as groupIndex } from "~/routes/manage/groups/index";
import { loader as jobIndex } from "~/routes/manage/jobs/index";
import { loader as jobNew } from "~/routes/manage/jobs/new";
import { loadAdminOperation } from "~/lib/admin/run-operation.server";

vi.mock("~/lib/session.server", () => ({
  requireAdmin: vi.fn(async () => ({ user: { id: 1, role: "admin" } })),
}));

it("uses catalog filtering, totals and continuation in the admin group list", async () => {
  await db.insert(groups).values(
    Array.from({ length: 105 }, (_, index) => ({
      name: `Matching ${index}`,
      slug: `group-${index}`,
      description: "Description",
      visible: index % 2 === 0,
    })),
  );
  await db.insert(groups).values({ name: "Other", slug: "other", description: "Description" });
  const request = new Request("https://example.com/manage/groups?q=Matching&offset=100");
  const result = await groupIndex({ request } as Parameters<typeof groupIndex>[0]);
  const catalog = await operationCatalog.groupList.execute(adminContext(1, "mcp"), {
    query: "Matching",
    sort: "createdAt",
    order: "desc",
    limit: 100,
    offset: 100,
  });
  expect(result.total).toBe(105);
  expect(result.groups).toEqual(catalog.items);
  expect(result.groups).toHaveLength(5);
});

it("loads every company choice across catalog pages", async () => {
  await db.insert(companies).values(
    Array.from({ length: 205 }, (_, index) => ({
      name: `Company ${String(index).padStart(3, "0")}`,
      slug: `company-${index}`,
      description: "Description",
      visible: index % 2 === 0,
    })),
  );
  const request = new Request("https://example.com/manage/jobs/new");
  const result = await jobNew({ request } as Parameters<typeof jobNew>[0]);
  expect(result.companies).toHaveLength(205);
  expect(result.companies.at(-1)?.name).toBe("Company 204");
});

it("maps missing and invalid catalog reads to HTTP errors without running writes", async () => {
  const request = new Request("https://example.com/manage");
  await expect(
    loadAdminOperation(request, operationCatalog.groupGet, { id: 999 }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    loadAdminOperation(request, operationCatalog.groupGet, { id: -1 }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    loadAdminOperation(request, operationCatalog.groupDelete, { id: 1, confirm: true }),
  ).rejects.toThrow("is not a read operation");
});

it("counts missing company fields only within the selected visibility", async () => {
  await db.insert(companies).values([
    { name: "Visible incomplete", slug: "incomplete", description: "Description", visible: true },
    {
      name: "Visible complete",
      slug: "complete",
      description: "Description",
      visible: true,
      logo: "logo.webp",
    },
    { name: "Hidden incomplete", slug: "hidden", description: "Description", visible: false },
  ]);
  const result = await operationCatalog.companyList.execute(adminContext(1), {
    missing: "logo",
    visible: true,
  });
  expect(result.total).toBe(1);
  expect(result.items.map((item) => item.slug)).toEqual(["incomplete"]);
});

it("preserves admin job searches by employer and short location strings", async () => {
  await db.insert(companies).values({
    id: 1,
    name: "Hidden Employer",
    slug: "employer",
    description: "Description",
    visible: false,
  });
  await db.insert(jobs).values({
    title: "Developer",
    slug: "developer",
    companyId: 1,
    location: "NL",
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  });
  for (const query of ["Employer", "NL"]) {
    const request = new Request(`https://example.com/manage/jobs?q=${query}`);
    const result = await jobIndex({ request } as Parameters<typeof jobIndex>[0]);
    expect(result.total).toBe(1);
    expect(result.jobs.map((row) => row.slug)).toEqual(["developer"]);
  }
});
