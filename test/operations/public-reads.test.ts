import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { jobs } from "~/db/schema";
import { operationCatalog as operations } from "~/operations/catalog";
import { adminContext, publicContext } from "~/operations/context";

it("excludes hidden companies and their attached records from public product results", async () => {
  const admin = adminContext(1);
  const company = await operations.companyCreate.execute(admin, {
    name: "Hidden employer",
    description: "Private draft",
    visible: false,
    email: "private@example.com",
  });
  const product = await operations.productCreate.execute(admin, {
    name: "Public product",
    description: "Description",
    companyId: company.id,
  });
  const companies = await operations.companyPublicList.execute(publicContext(), {});
  expect(companies.items.some((row) => row.id === company.id)).toBe(false);
  const products = await operations.productPublicList.execute(publicContext(), {});
  const result = products.items.find((row) => row.id === product.id);
  expect(result).toBeDefined();
  expect(result?.company).toBeNull();
  expect(JSON.stringify(products)).not.toContain("private@example.com");
  expect(operations.productPublicList.output.safeParse(products).success).toBe(true);
});

it("keeps source configuration private while preserving operator job discovery", async () => {
  const admin = adminContext(1);
  const company = await operations.companyCreate.execute(admin, {
    name: "Employer",
    description: "Description",
    visible: true,
  });
  const source = await operations.jobSourceCreate.execute(admin, {
    companyId: company.id,
    sourceType: "greenhouse",
    sourceIdentifier: "private-board",
    sourceUrl: "https://example.com/private-feed",
    skipValidation: true,
    confirm: true,
  });
  const job = await operations.jobCreate.execute(admin, {
    title: "Developer",
    description: "Description",
    url: "https://example.com/job",
    companyId: company.id,
  });
  await db.update(jobs).set({ sourceId: source.id, status: "active" }).where(eq(jobs.id, job.id));
  const publicRows = await operations.jobPublicList.execute(publicContext(), {});
  const publicJob = publicRows.items.find((row) => row.id === job.id);
  expect(publicJob).toBeDefined();
  expect(publicJob).not.toHaveProperty("importSourceIdentifier");
  expect(publicJob).not.toHaveProperty("importSourceUrl");
  expect(operations.jobPublicList.output.safeParse(publicRows).success).toBe(true);
  const operatorRows = await operations.jobList.execute(admin, { status: "all" });
  expect(operatorRows.items.find((row) => row.id === job.id)).toMatchObject({
    importSourceIdentifier: "private-board",
    importSourceUrl: "https://example.com/private-feed",
  });
  await operations.jobHide.execute(admin, { id: job.id });
  expect(
    (await operations.jobPublicList.execute(publicContext(), {})).items.some(
      (row) => row.id === job.id,
    ),
  ).toBe(false);
});

it("excludes hidden groups while preserving administrator visibility filters", async () => {
  const admin = adminContext(1);
  const visible = await operations.groupCreate.execute(admin, {
    name: "Public group",
    description: "Description",
    visible: true,
  });
  const hidden = await operations.groupCreate.execute(admin, {
    name: "Hidden group",
    description: "Private description",
    visible: false,
  });
  const page = await operations.groupPublicList.execute(publicContext(), {});
  expect(page.items.map((row) => row.id)).toEqual([visible.id]);
  expect(page).toMatchObject({ total: 1, nextOffset: null });
  const hiddenPage = await operations.groupList.execute(admin, { visible: false });
  expect(hiddenPage.items.map((row) => row.id)).toEqual([hidden.id]);
  expect(hiddenPage.total).toBe(1);
});
