import { requireAdmin } from "~/lib/session.server";
import { operationCatalog as operations } from "~/operations/catalog";
import { runAdminOperation } from "./run-operation.server";
import { jsonFromForm } from "./import-form-adapters";
export async function runDirectoryImportAction(
  request: Request,
  source: "technl" | "genesis" | "bounce",
) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "fetch") {
    const result = await runAdminOperation(request, operations.directoryImportFetch, {
      source,
      confirm: true,
    });
    return result.ok
      ? ({ intent: "fetch", companies: result.data, error: null } as const)
      : ({ intent: "fetch", companies: [], error: result.error } as const);
  }
  if (intent === "import") {
    let companies: unknown;
    try {
      companies = jsonFromForm(form, "companies");
    } catch (error) {
      return {
        intent: "import",
        imported: [],
        errors: [error instanceof Error ? error.message : "Invalid JSON"],
      } as const;
    }
    const result = await runAdminOperation(request, operations.directoryImport, {
      source,
      companies,
      downloadLogos: form.get("downloadLogos") === "true",
    });
    return result.ok
      ? ({ intent: "import", ...result.data } as const)
      : ({ intent: "import", imported: [], errors: [result.error] } as const);
  }
  if (intent === "adopt-field") {
    const result = await runAdminOperation(request, operations.directoryImportAdoptField, {
      source,
      name: form.get("name"),
      field: form.get("field"),
      value: form.get("value"),
      companyWebsite: form.get("companyWebsite") ?? null,
    });
    return result.ok
      ? ({ intent: "adopt-field", adopted: result.data } as const)
      : ({ intent: "adopt-field", error: result.error } as const);
  }
  if (intent === "block") {
    const result = await runAdminOperation(request, operations.blocklistAdd, {
      source,
      externalId: form.get("externalId"),
      name: form.get("name"),
      deleteExisting: true,
      confirm: true,
    });
    return result.ok
      ? ({
          intent: "block",
          blocked: { externalId: result.data.key, name: String(form.get("name")) },
        } as const)
      : ({ intent: "block", error: result.error } as const);
  }
  if (intent === "unblock") {
    const result = await runAdminOperation(request, operations.blocklistRemove, {
      source,
      externalId: form.get("externalId"),
    });
    return result.ok
      ? ({ intent: "unblock", unblocked: result.data.key } as const)
      : ({ intent: "unblock", error: result.error } as const);
  }
  return null;
}
