import { catalogHostFunctions } from "./catalog-host";
import type { HostFunctions, HostFunctionDocs } from "./host-function";
import { adminContext, publicContext, type OperationContext } from "~/operations/context";
import { ForbiddenError } from "~/operations/errors";
export type {
  HostFunction,
  HostFunctions,
  HostFnDoc,
  HostFnCategory,
  HostFunctionDocs,
  HostFunctionDocsEntry,
} from "./host-function";
export function buildReadFunctions(context: OperationContext = publicContext()): HostFunctions {
  return catalogHostFunctions(context, true);
}
export function buildExecuteFunctions(context: OperationContext): HostFunctions {
  if (context.actor?.role !== "admin" || !context.scopes.has("write"))
    throw new ForbiddenError("Administrator write access required");
  return catalogHostFunctions(context);
}
export function getHostFunctionDocs(context: OperationContext = publicContext()): HostFunctionDocs {
  const entries = (functions: HostFunctions) =>
    Object.entries(functions)
      .map(([name, fn]) => ({ name, ...fn.doc }))
      .sort((a, b) => a.name.localeCompare(b.name));
  return {
    read: entries(buildReadFunctions(context)),
    execute: entries(buildExecuteFunctions(adminContext(1))),
  };
}
