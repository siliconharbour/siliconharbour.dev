import { NotFoundError } from "../errors";
import { pageResult } from "../listing";
import { defineOperation } from "../define";
import { listThemeShares, deleteThemeShare } from "~/lib/theme-shares.server";
import {
  themeShareListInput,
  themeShareListOutput,
  themeShareDeleteInput,
  themeShareDeleteOutput,
} from "../contracts/theme-shares";

export const themeShareOperations = {
  themeShareList: defineOperation({
    name: "themeShareList",
    area: "theme-shares",
    risk: "read",
    access: "admin",
    summary: "List saved theme shares.",
    description:
      "Return paginated shares with IPs and timestamps for administration. Never returns editing keys or logo bytes. Use themeShareDelete to remove one.",
    input: themeShareListInput,
    output: themeShareListOutput,
    examples: [{ title: "First page", input: {} }],
    run: (_context, input) => {
      const result = listThemeShares(
        input.limit,
        input.offset,
        input.query,
        input.sort,
        input.order,
      );
      return pageResult(input, result.items, result.total);
    },
  }),
  themeShareDelete: defineOperation({
    name: "themeShareDelete",
    area: "theme-shares",
    risk: "destructive",
    access: "admin",
    summary: "Delete one saved theme share.",
    description:
      "Remove the saved theme and its logo. Does not remove local browser copies. Requires confirm: true.",
    input: themeShareDeleteInput,
    output: themeShareDeleteOutput,
    examples: [{ title: "Delete a share", input: { id: "a".repeat(32), confirm: true } }],
    run: (_context, input) => {
      const result = deleteThemeShare(input.id);
      if (!result.deleted) throw new NotFoundError("Theme share not found");
      return result;
    },
  }),
};
