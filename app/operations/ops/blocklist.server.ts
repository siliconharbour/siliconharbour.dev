import { normalizeBlockKey } from "~/lib/import-blocklist-key";
import { z } from "zod";
import { defineOperation } from "../define";
import { toPlain } from "../plain";
import {
  blocklistListInput,
  blocklistAddInput,
  blocklistRemoveInput,
  blocklistItemOutput,
} from "../contracts/blocklist";
import { getBlockedItems, unblockItem } from "~/lib/import-blocklist.server";
import { blockImportedIdentity } from "~/lib/blocklist-admin.server";
export const blocklistOperations = {
  blocklistList: defineOperation({
    name: "blocklistList",
    area: "blocklist",
    risk: "read",
    access: "admin",
    summary: "List blocked import identities.",
    description:
      "Return a bounded page for a selected source or all directory/GitHub sources. Keys use the same normalization as importers.",
    input: blocklistListInput,
    output: z.array(blocklistItemOutput),
    examples: [{ title: "GitHub blocks", input: { source: "github" } }],
    run: async (_ctx, input) => {
      const sources = input.source ? [input.source] : ["github", "technl", "genesis", "bounce"];
      const lists = await Promise.all(sources.map(getBlockedItems));
      return toPlain(lists.flat().slice(input.offset, input.offset + input.limit));
    },
  }),
  blocklistAdd: defineOperation({
    name: "blocklistAdd",
    area: "blocklist",
    risk: "destructive",
    access: "admin",
    summary: "Block an identity from future imports.",
    description:
      "Normalize the source key and persist the block before optional deletion of matching stored records. deleteExisting removes matching people, companies, or education institutions and unreferenced images. Requires confirm: true.",
    input: blocklistAddInput,
    output: z
      .object({ blocked: z.literal(true), key: z.string(), deletedIds: z.array(z.number()) })
      .strict(),
    examples: [
      {
        title: "Block GitHub login",
        input: { source: "github", externalId: "example", name: "Example", confirm: true },
      },
    ],
    run: (_ctx, input) => blockImportedIdentity(input),
  }),
  blocklistRemove: defineOperation({
    name: "blocklistRemove",
    area: "blocklist",
    risk: "write",
    access: "admin",
    summary: "Remove an import block.",
    description:
      "Normalize the key, remove its matching block, and allow later imports. Does not recreate a deleted record.",
    input: blocklistRemoveInput,
    output: z.object({ removed: z.boolean(), key: z.string() }).strict(),
    examples: [{ title: "Unblock", input: { source: "github", externalId: "example" } }],
    run: async (_ctx, input) => {
      const removed = await unblockItem(input.source, input.externalId);
      return { removed, key: normalizeBlockKey(input.source, input.externalId) };
    },
  }),
};
