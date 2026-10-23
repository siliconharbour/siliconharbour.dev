import { page } from "../listing";
import { listComments } from "~/lib/content-lists.server";
import { z } from "zod";
import { defineOperation } from "../define";
import { deleteInput } from "../fields";
import { commentListInput, commentListOutput } from "../contracts/comments";
import { getPaginatedComments, getCommentById, deleteComment } from "~/lib/comments.server";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
export const commentOperations = {
  commentList: defineOperation({
    name: "commentList",
    area: "comments",
    risk: "read",
    access: "admin",
    summary: "List comments for moderation.",
    description:
      "Return a bounded page including private comments and moderation metadata. This data is administrator-only.",
    input: commentListInput,
    output: commentListOutput,
    examples: [{ title: "First page", input: {} }],
    run: async (_ctx, input) => toPlain(await listComments(input)),
  }),
  commentDelete: defineOperation({
    name: "commentDelete",
    area: "comments",
    risk: "destructive",
    access: "admin",
    summary: "Delete a comment.",
    description:
      "Permanently remove the comment using the shared moderation service. Requires confirm: true.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true) }).strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: async (_ctx, { id }) => {
      if (!(await getCommentById(id))) throw new NotFoundError("Comment not found");
      await deleteComment(id);
      return { deleted: true as const };
    },
  }),
};
