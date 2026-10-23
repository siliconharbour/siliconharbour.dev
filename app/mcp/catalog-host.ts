import { hostSignature } from "./host-function";
import type { HostFunctions } from "./host-function";
import { operationCatalog } from "~/operations/catalog";
import type { OperationContext } from "~/operations/context";

export function catalogHostFunctions(context: OperationContext, readsOnly = false): HostFunctions {
  return Object.fromEntries(
    Object.entries(operationCatalog)
      .filter(
        ([, operation]) =>
          (!readsOnly || operation.risk === "read") &&
          (operation.access === "public" || context.actor?.role === "admin") &&
          context.scopes.has(operation.risk === "read" ? "read" : "write"),
      )
      .map(([name, operation]) => [
        name,
        Object.assign((input: unknown) => operation.execute(context, input), {
          inputSchema: operation.input,
          outputSchema: operation.output,
          doc: {
            signature: hostSignature(name, operation.input),
            description: `${operation.summary} ${operation.description}`,
            category: operation.area,
            risk: operation.risk,
          },
        }),
      ]),
  );
}
