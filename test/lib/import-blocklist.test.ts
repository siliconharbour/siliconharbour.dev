import { describe, it, expect } from "vitest";
import {
  isBlocked,
  blockItem,
  unblockItem,
  getBlockedItems,
  getBlockedExternalIds,
} from "~/lib/import-blocklist.server";

// =============================================================================
// isBlocked / blockItem / unblockItem
// =============================================================================

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

  it("blocking an already-blocked item is a no-op (updates reason if given)", async () => {
    await blockItem("github", "user-dup", "Dup User", "spam");
    await blockItem("github", "user-dup", "Dup User", "updated reason");

    // Still blocked, only one row
    const items = await getBlockedItems("github");
    const matches = items.filter((i) => i.externalId === "user-dup");
    expect(matches).toHaveLength(1);
    expect(matches[0].reason).toBe("updated reason");
  });
});

// =============================================================================
// getBlockedItems / getBlockedExternalIds
// =============================================================================

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

  it("case mismatch: isBlocked is case-sensitive but getBlockedExternalIds lowercases", async () => {
    await blockItem("github", "MixedCase", "Mixed");

    // isBlocked uses exact match — lowercase won't match
    const exact = await isBlocked("github", "MixedCase");
    const lower = await isBlocked("github", "mixedcase");

    expect(exact).toBe(true);
    expect(lower).toBe(false);

    // getBlockedExternalIds lowercases — only lowercase in Set
    const ids = await getBlockedExternalIds("github");
    expect(ids.has("mixedcase")).toBe(true);
    expect(ids.has("MixedCase")).toBe(false);
  });
});
