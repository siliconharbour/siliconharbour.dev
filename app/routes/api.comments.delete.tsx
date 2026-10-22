import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/api.comments.delete";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await runAdminOperation(request, operationCatalog.commentDelete, {
    id: Number(form.get("commentId")),
    confirm: true,
  });
  return result.ok ? { success: true } : { error: result.error };
}
