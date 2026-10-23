import { expect, it } from "vitest";
import { db } from "~/db";
import {
  companies,
  people,
  education,
  groups,
  technologies,
  products,
  projects,
  events,
  jobs,
  news,
  technologyAssignments,
  projectImages,
} from "~/db/schema";
import { operationCatalog as ops } from "~/operations/catalog";
import { publicContext } from "~/operations/context";
import { NotFoundError } from "~/operations/errors";

const ctx = publicContext();
it("returns NotFound for hidden records through every public detail boundary", async () => {
  await db
    .insert(companies)
    .values({ name: "Hidden", slug: "hidden", description: "Private", visible: false });
  await db
    .insert(people)
    .values({ name: "Hidden", slug: "hidden", bio: "Private", visible: false });
  await db
    .insert(education)
    .values({ name: "Hidden", slug: "hidden", description: "Private", visible: false });
  await db
    .insert(groups)
    .values({ name: "Hidden", slug: "hidden", description: "Private", visible: false });
  await db
    .insert(technologies)
    .values({ name: "Hidden", slug: "hidden", category: "language", visible: false });
  await db.insert(events).values({
    title: "Hidden",
    slug: "hidden",
    description: "Private",
    link: "https://example.com",
    importStatus: "pending_review",
  });
  await db.insert(jobs).values({
    title: "Hidden",
    slug: "hidden",
    status: "hidden",
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  });
  await db.insert(news).values({
    title: "Hidden",
    slug: "hidden",
    content: "Private",
    type: "article",
    status: "draft",
  });
  for (const op of [
    ops.companyPublicGet,
    ops.personPublicGet,
    ops.educationPublicGet,
    ops.groupPublicGet,
    ops.technologyPublicGet,
    ops.eventPublicGet,
    ops.jobPublicGet,
    ops.newsPublicGet,
  ]) {
    await expect(op.execute(ctx, { slug: "hidden" }), op.name).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(op.execute(ctx, { slug: "missing" }), op.name).rejects.toBeInstanceOf(
      NotFoundError,
    );
  }
  for (const op of [ops.productPublicGet, ops.projectPublicGet])
    await expect(op.execute(ctx, { slug: "missing" }), op.name).rejects.toBeInstanceOf(
      NotFoundError,
    );
});

it("includes visible technologies, products, galleries and event relations without moderation fields", async () => {
  await db.insert(companies).values([
    {
      id: 1,
      name: "Public",
      slug: "public",
      description: "Description",
      visible: true,
      email: "private@example.com",
      newsFilterInclude: true,
    },
    { id: 2, name: "Hidden", slug: "hidden", description: "Private", visible: false },
  ]);
  await db
    .insert(products)
    .values({ name: "Product", slug: "product", description: "Description", companyId: 1 });
  await db
    .insert(projects)
    .values({ id: 1, name: "Project", slug: "project", description: "Description" });
  await db
    .insert(projectImages)
    .values({ projectId: 1, image: "gallery.webp", caption: "Screenshot" });
  await db.insert(technologies).values([
    {
      id: 1,
      name: "Visible technology",
      slug: "visible-tech",
      category: "language",
      visible: true,
    },
    { id: 2, name: "Hidden technology", slug: "hidden-tech", category: "language", visible: false },
  ]);
  await db.insert(technologyAssignments).values([
    { technologyId: 1, contentType: "company", contentId: 1 },
    { technologyId: 2, contentType: "company", contentId: 1 },
    { technologyId: 1, contentType: "company", contentId: 2 },
    { technologyId: 1, contentType: "project", contentId: 1 },
  ]);
  const company = await ops.companyPublicGet.execute(ctx, { slug: "public" });
  expect(company.technologies.map((row) => row.slug)).toEqual(["visible-tech"]);
  expect(company.products.map((row) => row.slug)).toEqual(["product"]);
  expect(company).not.toHaveProperty("email");
  expect(company).not.toHaveProperty("newsFilterInclude");
  const project = await ops.projectPublicGet.execute(ctx, { slug: "project" });
  expect(project.images).toMatchObject([{ image: "gallery.webp", caption: "Screenshot" }]);
  expect(project.technologies.map((row) => row.slug)).toEqual(["visible-tech"]);
  const technology = await ops.technologyPublicGet.execute(ctx, { slug: "visible-tech" });
  expect(technology.companies.map((row) => row.slug)).toEqual(["public"]);
  expect(technology.projects.map((row) => row.slug)).toEqual(["project"]);
  await db.insert(events).values([
    {
      id: 1,
      title: "Parent",
      slug: "parent",
      description: "Description",
      link: "https://example.com",
      timeMode: "period",
    },
    {
      title: "Child",
      slug: "child",
      description: "Description",
      link: "https://example.com",
      parentEventId: 1,
    },
    {
      title: "Hidden child",
      slug: "hidden-child",
      description: "Private",
      link: "https://example.com",
      parentEventId: 1,
      importStatus: "hidden",
    },
  ]);
  expect(
    (await ops.eventPublicGet.execute(ctx, { slug: "parent" })).schedule.map((row) => row.slug),
  ).toEqual(["child"]);
  expect((await ops.eventPublicGet.execute(ctx, { slug: "child" })).parent?.slug).toBe("parent");
});

it("does not expose hidden parent companies or import metadata in public jobs and products", async () => {
  await db.insert(companies).values({
    id: 1,
    name: "Secret employer",
    slug: "secret",
    description: "Private",
    visible: false,
  });
  await db
    .insert(products)
    .values({ name: "Product", slug: "product", description: "Description", companyId: 1 });
  await db.insert(jobs).values({
    title: "Job",
    slug: "job",
    companyId: 1,
    status: "active",
    externalId: "private-provider-id",
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  });
  expect((await ops.productPublicGet.execute(ctx, { slug: "product" })).company).toBeNull();
  const detail = await ops.jobPublicGet.execute(ctx, { slug: "job" });
  const list = await ops.jobPublicList.execute(ctx, {});
  expect(detail.company).toBeNull();
  expect(list.items[0]?.company).toBeNull();
  for (const result of [detail, ...list.items]) {
    expect(result).not.toHaveProperty("companyId");
    expect(result).not.toHaveProperty("sourceId");
    expect(result).not.toHaveProperty("externalId");
    expect(JSON.stringify(result)).not.toContain("Secret employer");
  }
});
