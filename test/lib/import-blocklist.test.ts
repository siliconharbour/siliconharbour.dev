import { describe, it, expect } from "vitest";
import {
  isBlocked,
  blockItem,
  unblockItem,
  getBlockedItems,
  getBlockedExternalIds,
} from "~/lib/import-blocklist.server";

import { normalizeBlockKey } from "~/lib/import-blocklist-key";

describe("import blocklist", () => {
  it("is not blocked initially", async () => {
    const result = await isBlocked("github", "user-123");
    expect(result).toBe(false);
  });

  it("block item -> isBlocked returns true", async () => {
    await blockItem("github", "user-123", "Test User");
    const result = await isBlocked("github", "user-123");
    expect(result).toBe(true);
  });

  it("unblock -> isBlocked returns false", async () => {
    await blockItem("github", "user-456", "Another User");
    await unblockItem("github", "user-456");
    const result = await isBlocked("github", "user-456");
    expect(result).toBe(false);
  });

  it("different sources are independent", async () => {
    await blockItem("github", "shared-id", "GitHub User");

    const blockedOnGithub = await isBlocked("github", "shared-id");
    const blockedOnTechnl = await isBlocked("technl", "shared-id");

    expect(blockedOnGithub).toBe(true);
    expect(blockedOnTechnl).toBe(false);
  });

  it("blocking an already-blocked item preserves its metadata", async () => {
    await blockItem("github", "user-dup", "Dup User", "spam");
    await blockItem("github", "user-dup", "Dup User", "updated reason");

    const items = await getBlockedItems("github");
    const matches = items.filter((i) => i.externalId === "user-dup");
    expect(matches).toHaveLength(1);
    expect(matches[0].reason).toBe("spam");
  });
});

describe("getBlockedItems", () => {
  it("returns all blocked items for a source", async () => {
    await blockItem("technl", "company-a", "Company A", "not tech");
    await blockItem("technl", "company-b", "Company B");
    await blockItem("github", "user-x", "User X"); // different source

    const items = await getBlockedItems("technl");
    expect(items).toHaveLength(2);

    const ids = items.map((i) => i.externalId).sort();
    expect(ids).toEqual(["company-a", "company-b"]);
  });
});

describe("getBlockedExternalIds", () => {
  it("returns just the external IDs as a Set", async () => {
    await blockItem("github", "User-A", "User A");
    await blockItem("github", "User-B", "User B");

    const ids = await getBlockedExternalIds("github");
    expect(ids).toBeInstanceOf(Set);
    expect(ids.size).toBe(2);
  });

  it("lowercases the external IDs", async () => {
    await blockItem("github", "CamelCase-ID", "Camel Case");

    const ids = await getBlockedExternalIds("github");
    expect(ids.has("camelcase-id")).toBe(true);
    expect(ids.has("CamelCase-ID")).toBe(false);
  });

  it("matches GitHub keys case-insensitively across lookup methods", async () => {
    await blockItem("github", "MixedCase", "Mixed");

    const exact = await isBlocked("github", "MixedCase");
    const lower = await isBlocked("github", "mixedcase");

    expect(exact).toBe(true);
    expect(lower).toBe(true);

    const ids = await getBlockedExternalIds("github");
    expect(ids.has("mixedcase")).toBe(true);
    expect(ids.has("MixedCase")).toBe(false);
  });
});

describe("normalizeUrl blocklist integration", () => {
  it("normalizeUrl lowercases path so it matches getBlockedExternalIds", async () => {
    // Simulate: block a company whose website has mixed-case path
    const url = "http://www.ic.gc.ca/Intro.html";
    const externalId = normalizeBlockKey("technl", url);

    expect(externalId).toBe("ic.gc.ca/intro.html"); // path must be lowercased

    await blockItem("technl", externalId, "ISED Canada");

    // getBlockedExternalIds also lowercases — should find it
    const blockedSet = await getBlockedExternalIds("technl");
    expect(blockedSet.has(externalId)).toBe(true);
  });
});

it("upserts concurrent normalized identities without losing the original block date or reason", async () => {
  await blockItem("github", "https://github.com/Foo/", "Foo", "Original reason");
  const before = (await getBlockedItems("github"))[0];
  await Promise.all([
    blockItem("github", "@foo", "Foo"),
    blockItem("github", "github.com/FOO", "Foo"),
  ]);
  const rows = await getBlockedItems("github");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    externalId: "foo",
    reason: "Original reason",
    blockedAt: before.blockedAt,
  });
  expect(await unblockItem("github", "https://www.github.com/foo")).toBe(true);
  expect(await unblockItem("github", "foo")).toBe(false);
});

it("uses one normalized directory key for bare domains, full URLs and padded names", () => {
  for (const source of ["technl", "genesis", "bounce"]) {
    expect(normalizeBlockKey(source, "www.X.com/")).toBe("x.com");
    expect(normalizeBlockKey(source, "https://x.com")).toBe("x.com");
    expect(normalizeBlockKey(source, "X.com/Path/")).toBe("x.com/path");
    expect(normalizeBlockKey(source, "  Garrison Guitars ")).toBe("garrison guitars");
  }
});

it("uses the server's canonical key for directory cards and GitHub badges", async () => {
  const { getExternalId } = await import("~/lib/directory-import");
  for (const company of [
    { name: "  Garrison Guitars ", website: null },
    { name: "Example", website: "www.Example.com/Path/" },
  ]) {
    const cardKey = getExternalId({
      ...company,
      description: null,
      email: null,
      logoUrl: null,
      categories: [],
      sourceUrl: "",
      sourceId: "",
    });
    await blockItem("bounce", company.website || company.name, company.name);
    expect((await getBlockedExternalIds("bounce")).has(cardKey)).toBe(true);
  }
  const user = { login: "MixedCase", html_url: "https://github.com/MixedCase" };
  await blockItem("github", user.html_url, user.login);
  expect(
    (await getBlockedExternalIds("github")).has(normalizeBlockKey("github", user.html_url)),
  ).toBe(true);
});
