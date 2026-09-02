import { describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "~/db";
import { products, projects } from "~/db/schema";
import { getPaginatedProducts } from "~/lib/products.server";
import { getPaginatedProjects } from "~/lib/projects.server";
import { searchContentIds, searchRankOrder } from "~/lib/search.server";

describe("public list ordering", () => {
  it("lists products and projects alphabetically", async () => {
    await db.insert(products).values([
      { slug: "zulu-product", name: "Zulu Product", description: "Z" },
      { slug: "alpha-product", name: "Alpha Product", description: "A" },
    ]);
    await db.insert(projects).values([
      { slug: "zulu-project", name: "Zulu Project", description: "Z" },
      { slug: "alpha-project", name: "Alpha Project", description: "A" },
    ]);

    const [productPage, projectPage] = await Promise.all([
      getPaginatedProducts(20, 0),
      getPaginatedProjects(20, 0),
    ]);

    expect(productPage.items.map((item) => item.name)).toEqual(["Alpha Product", "Zulu Product"]);
    expect(projectPage.items.map((item) => item.name)).toEqual(["Alpha Project", "Zulu Project"]);
  });

  it("turns ranked search IDs into a matching SQL order", async () => {
    const inserted = await db
      .insert(products)
      .values([
        { slug: "first-product", name: "First Product", description: "First" },
        { slug: "second-product", name: "Second Product", description: "Second" },
      ])
      .returning();
    const rankedIds = [inserted[1].id, inserted[0].id];

    const rows = await db
      .select()
      .from(products)
      .where(inArray(products.id, rankedIds))
      .orderBy(searchRankOrder(products.id, rankedIds));

    expect(rows.map((row) => row.id)).toEqual(rankedIds);
  });

  it("preserves FTS relevance in a paginated product search", async () => {
    await db.insert(products).values([
      {
        slug: "harbour-exact",
        name: "Harbour",
        description: "Local product",
      },
      {
        slug: "harbour-description",
        name: "Unrelated Name",
        description: "Harbour appears in this longer description",
      },
    ]);

    const rankedIds = searchContentIds("product", "harbour");
    const page = await getPaginatedProducts(20, 0, "harbour");

    expect(rankedIds).toHaveLength(2);
    expect(page.items.map((item) => item.id)).toEqual(rankedIds);
  });
});
