import { expect, it, vi } from "vitest";
import { operationCatalog as ops } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { blockItem, getBlockedItem } from "~/lib/import-blocklist.server";
import { action as editBlock } from "~/routes/manage/blocklist";

vi.mock("~/lib/session.server", () => ({
  requireAdmin: async () => ({ user: { id: 1, role: "admin" } }),
}));
const ctx = adminContext(1);

it("edits metadata and clears a reason without changing the identity or block date", async () => {
  blockItem("github", "@Example", "Original", "Custom reason");
  const original = (await getBlockedItem("github", "example"))!;
  await ops.blocklistUpdate.execute(ctx, { id: original.id, reason: "Updated reason" });
  await ops.blocklistUpdate.execute(ctx, { id: original.id, name: "Renamed" });
  expect(await getBlockedItem("github", "example")).toMatchObject({
    name: "Renamed",
    reason: "Updated reason",
    blockedAt: original.blockedAt,
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    intent: "update",
    id: String(original.id),
    name: "Admin name",
    reason: "",
  }))
    form.set(key, value);
  await editBlock({
    request: new Request("https://example.com/manage/blocklist", { method: "POST", body: form }),
  } as Parameters<typeof editBlock>[0]);
  expect(await getBlockedItem("github", "example")).toMatchObject({
    id: original.id,
    name: "Admin name",
    reason: null,
    blockedAt: original.blockedAt,
  });
  blockItem("github", "example", "Automatic name", "Rejected during review");
  expect((await getBlockedItem("github", "example"))?.reason).toBeNull();
  await expect(ops.blocklistUpdate.execute(ctx, { id: 999, reason: "Missing" })).rejects.toThrow(
    "not found",
  );
  await expect(ops.blocklistUpdate.execute(ctx, { id: original.id })).rejects.toThrow(
    "No fields to update",
  );
});

it.each(["personDelete", "personReject", "personBulkReject"] as const)(
  "%s preserves an existing custom reason",
  async (name) => {
    const person = await ops.personCreate.execute(ctx, {
      name: "Review target",
      bio: "Description",
      github: "example",
    });
    blockItem("github", "example", "Original name", "Custom reason");
    const original = await getBlockedItem("github", "example");
    await ops[name].execute(
      ctx,
      name === "personDelete"
        ? { id: person.id, block: { source: "github" }, confirm: true }
        : name === "personBulkReject"
          ? { pattern: "Review target", confirm: true }
          : { id: person.id, confirm: true },
    );
    expect(await getBlockedItem("github", "example")).toEqual(original);
  },
);

it.each(["companyDelete", "companyReject"] as const)(
  "%s preserves an existing custom reason",
  async (name) => {
    const company = await ops.companyCreate.execute(ctx, {
      name: "Company",
      description: "Description",
      website: "https://example.com",
      technl: true,
    });
    blockItem("technl", "example.com", "Original name", "Custom reason");
    const original = await getBlockedItem("technl", "example.com");
    await ops[name].execute(ctx, {
      id: company.id,
      confirm: true,
      ...(name === "companyDelete" ? { block: { source: "technl" } } : {}),
    });
    expect(await getBlockedItem("technl", "example.com")).toEqual(original);
  },
);

it("uses supplied and default reasons for new blocks", async () => {
  const first = await ops.personCreate.execute(ctx, {
    name: "First",
    bio: "Description",
    github: "first",
  });
  await ops.personDelete.execute(ctx, {
    id: first.id,
    confirm: true,
    block: { source: "github", reason: "Inactive on GitHub" },
  });
  expect((await getBlockedItem("github", "first"))?.reason).toBe("Inactive on GitHub");
  const second = await ops.personCreate.execute(ctx, {
    name: "Second",
    bio: "Description",
    github: "second",
  });
  await ops.personReject.execute(ctx, { id: second.id, confirm: true });
  expect((await getBlockedItem("github", "second"))?.reason).toBe("Rejected during review");
  await ops.personCreate.execute(ctx, {
    name: "Third",
    bio: "Description",
    github: "third",
  });
  await ops.personBulkReject.execute(ctx, {
    pattern: "Third",
    reason: "Outside the community",
    confirm: true,
  });
  expect((await getBlockedItem("github", "third"))?.reason).toBe("Outside the community");
});

it("restoring a rejection preserves a block that predates it", async () => {
  const person = await ops.personCreate.execute(ctx, {
    name: "Existing block",
    bio: "Description",
    github: "existing",
  });
  blockItem("github", "existing", "Existing block", "Custom reason");
  const original = await getBlockedItem("github", "existing");
  const rejected = await ops.personReject.execute(ctx, { id: person.id, confirm: true });
  await ops.rejectedRecordRestore.execute(ctx, { id: rejected.restoreId, confirm: true });
  expect(await getBlockedItem("github", "existing")).toEqual(original);
});
