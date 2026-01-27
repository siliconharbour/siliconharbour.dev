import type { Route } from "./+types/api.comments.delete";

import { requireAuth } from "~/lib/session.server";
import { deleteComment } from "~/lib/comments.server";

export async function action({ request }: Route.ActionArgs) {
  // Require admin authentication
  const { user } = await requireAuth(request);
  if (user.role !== "admin") {
    return { error: "Unauthorized" };
  }

  const formData = await request.formData();
  const commentIdStr = formData.get("commentId") as string;
  const commentId = parseInt(commentIdStr, 10);

  if (isNaN(commentId) || commentId <= 0) {
    return { error: "Invalid comment ID" };
  }

  try {
    await deleteComment(commentId);
    return { success: true };
  } catch (error) {
    console.error("Error deleting comment:", error);
    return { error: "Failed to delete comment" };
  }
}
