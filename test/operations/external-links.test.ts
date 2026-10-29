import { expect, it } from "vitest";
import { operationCatalog as ops } from "~/operations/catalog";
import { adminContext, publicContext } from "~/operations/context";
import { hostSignature } from "~/mcp/host-function";
import { loader as companyApi } from "~/routes/api/companies.$slug";
import { loader as personApi } from "~/routes/api/people.$slug";

const ctx = adminContext(1);
for (const type of ["person", "company"] as const) {
  it(`${type} exposes external links through public reads, API, and GitHub search`, async () => {
    const input = {
      name: "Linked record",
      ...(type === "person" ? { bio: "Bio" } : { description: "Description" }),
      visible: true,
      externalLinks: {
        github: "@IDENTITY",
        wikipedia: "https://en.wikipedia.org/wiki/Example",
        linkedin: "https://www.linkedin.com/company/Example",
      },
    };
    const record = await ops[`${type}Create`].execute(ctx, input);
    expect(record.externalLinks).toEqual({
      github: "https://github.com/identity",
      wikipedia: "https://en.wikipedia.org/wiki/Example",
      linkedin: "https://linkedin.com/company/Example",
    });
    expect(
      (await ops[`${type}List`].execute(ctx, { query: "github.com/identity" })).items.map(
        (row) => row.id,
      ),
    ).toEqual([record.id]);
    const publicRecord = await ops[`${type}PublicGet`].execute(publicContext(), {
      slug: record.slug,
    });
    expect(publicRecord).toHaveProperty("externalLinks", record.externalLinks);
    expect((await ops[`${type}PublicList`].execute(publicContext(), {})).items[0]).toHaveProperty(
      "externalLinks",
      record.externalLinks,
    );
    const response = await (type === "company" ? companyApi : personApi)({
      params: { slug: record.slug },
    });
    expect(await response.json()).toHaveProperty("externalLinks", record.externalLinks);
    for (const field of ["github", "wikipedia", "linkedin", "socialLinks"]) {
      expect(publicRecord).not.toHaveProperty(field);
      await expect(
        ops[`${type}Update`].execute(ctx, { id: record.id, [field]: "https://example.com" }),
      ).rejects.toThrow(field);
      await expect(
        ops[`${type}Create`].execute(ctx, { ...input, [field]: "https://example.com" }),
      ).rejects.toThrow(field);
    }
    expect(hostSignature(`${type}Update`, ops[`${type}Update`].input)).toContain("externalLinks");
    await expect(
      ops[`${type}Update`].execute(ctx, {
        id: record.id,
        externalLinks: { arbitrary: "https://example.com" },
      }),
    ).rejects.toThrow("arbitrary");
  });
}
it("filters missing LinkedIn by the nested link, including cleared and absent objects", async () => {
  const base = { description: "Description" };
  const linked = await ops.companyCreate.execute(ctx, {
    ...base,
    name: "Linked",
    externalLinks: { linkedin: "https://linkedin.com/company/linked" },
  });
  const empty = await ops.companyCreate.execute(ctx, { ...base, name: "Empty" });
  const other = await ops.companyCreate.execute(ctx, {
    ...base,
    name: "Other",
    externalLinks: { wikipedia: "https://en.wikipedia.org/wiki/Other" },
  });
  const missingIds = async () =>
    (await ops.companyList.execute(ctx, { missing: "linkedin" })).items
      .map((row) => row.id)
      .sort((a, b) => a - b);
  expect(await missingIds()).toEqual([empty.id, other.id]);
  await ops.companyUpdate.execute(ctx, { id: linked.id, externalLinks: { linkedin: null } });
  expect(await missingIds()).toEqual([linked.id, empty.id, other.id]);
});
it("uses nested company GitHub identity for conditional create without changing stored links", async () => {
  const record = await ops.companyCreate.execute(ctx, {
    name: "First",
    description: "Description",
    externalLinks: { github: "@Identity", wikipedia: "https://en.wikipedia.org/wiki/First" },
  });
  expect(
    await ops.companyCreate.execute(ctx, {
      name: "Second",
      description: "Description",
      ifNotExists: true,
      externalLinks: { github: "identity", wikipedia: null },
    }),
  ).toMatchObject({ id: record.id, created: false, externalLinks: record.externalLinks });
});
