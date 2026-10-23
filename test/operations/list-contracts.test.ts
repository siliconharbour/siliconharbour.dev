import { expect, it } from "vitest";
import { z } from "zod";
import { operationCatalog as operations } from "~/operations/catalog";
import { adminContext, publicContext } from "~/operations/context";

it("uses shared pagination fields for every list operation", () => {
  for (const operation of Object.values(operations).filter(
    (operation) => operation.name.endsWith("List") || operation.name === "discordPostHistory",
  )) {
    const input = z.toJSONSchema(operation.input, { io: "input", unrepresentable: "any" });
    const output = z.toJSONSchema(operation.output, { io: "output", unrepresentable: "any" });
    for (const field of ["limit", "offset", "query", "sort", "order"])
      expect(input.properties, `${operation.name}.${field}`).toHaveProperty(field);
    expect(output.properties?.total, operation.name).toHaveProperty(
      "type",
      operation.name === "newsletterCampaignList" || operation.name === "newsletterSubscriberList"
        ? "null"
        : "integer",
    );
    for (const field of ["items", "total", "nextOffset"])
      expect(output.properties, `${operation.name}.${field}`).toHaveProperty(field);
    expect(input.additionalProperties, operation.name).toBe(false);
    expect(output.additionalProperties, operation.name).toBe(false);
  }
});
it("filters and counts directory pages in SQL, including hidden records and source presence", async () => {
  const context = adminContext(1);
  for (const name of ["Alpha", "Beta", "Gamma"])
    await operations.companyCreate.execute(context, {
      name,
      description: "Page fixture",
      visible: name !== "Gamma",
      website: `https://${name.toLowerCase()}.example.com`,
    });
  const first = await operations.companyList.execute(context, {
    query: "example.com",
    limit: 2,
    sort: "name",
    order: "asc",
  });
  expect(first.items.map((row) => row.name)).toEqual(["Alpha", "Beta"]);
  expect(first).toMatchObject({ total: 3, nextOffset: 2 });
  const last = await operations.companyList.execute(context, {
    query: "example.com",
    limit: 2,
    offset: first.nextOffset!,
    sort: "name",
    order: "asc",
  });
  expect(last.items.map((row) => row.name)).toEqual(["Gamma"]);
  expect(last).toMatchObject({ total: 3, nextOffset: null });
  expect(
    (await operations.companyPublicList.execute(publicContext(), { query: "example.com" })).total,
  ).toBe(2);
  const source = await operations.jobSourceCreate.execute(context, {
    companyId: first.items[0].id,
    sourceType: "greenhouse",
    sourceIdentifier: "alpha",
    skipValidation: true,
    confirm: true,
  });
  expect(
    (await operations.companyList.execute(context, { hasJobSource: true })).items.map(
      (row) => row.id,
    ),
  ).toEqual([source.companyId]);
});
it("searches canonical block keys and returns newest-first totals across sources", async () => {
  const context = adminContext(1);
  await operations.blocklistAdd.execute(context, {
    source: "github",
    externalId: "chibuzone",
    name: "First",
    confirm: true,
  });
  await operations.blocklistAdd.execute(context, {
    source: "bounce",
    externalId: "example.com",
    name: "Second",
    confirm: true,
  });
  const found = await operations.blocklistList.execute(context, { query: "chib" });
  expect(found.items).toHaveLength(1);
  expect(found.items[0].key).toBe("chibuzone");
  expect(found.total).toBe(1);
  const latest = await operations.blocklistList.execute(context, { limit: 1 });
  expect(latest.items[0].name).toBe("Second");
  expect(latest).toMatchObject({ total: 2, nextOffset: 1 });
});

it("pages complete Discord batches rather than truncating a batch's destinations", async () => {
  const { db } = await import("~/db");
  const { discordPosts } = await import("~/db/schema");
  for (let index = 0; index < 6; index++)
    await db.insert(discordPosts).values({
      channelType: "events",
      batchId: "newest",
      discordChannelId: String(index),
      introText: "Current",
      postedAt: new Date("2026-10-23T10:00:00Z"),
    });
  await db.insert(discordPosts).values({
    channelType: "events",
    batchId: "older",
    discordChannelId: "99",
    introText: "Older",
    postedAt: new Date("2026-10-22T10:00:00Z"),
  });
  const first = await operations.discordPostHistory.execute(adminContext(1), {
    type: "events",
    limit: 1,
  });
  expect(first).toMatchObject({ total: 2, nextOffset: 1 });
  expect(first.items[0].destinations).toHaveLength(6);
  const last = await operations.discordPostHistory.execute(adminContext(1), {
    type: "events",
    limit: 1,
    offset: first.nextOffset!,
  });
  expect(last.items[0].batchId).toBe("older");
  expect(last.nextOffset).toBeNull();
});
