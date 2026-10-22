import type { HostFunctions } from "./bridge";
import { operationCatalog } from "~/operations/catalog";
import type { OperationContext } from "~/operations/context";

export function catalogHostFunctions(context: OperationContext, readsOnly = false): HostFunctions {
  return Object.fromEntries(
    Object.entries(operationCatalog)
      .filter(
        ([, operation]) =>
          (!readsOnly || operation.risk === "read") &&
          (operation.access === "public" || context.actor?.role === "admin") &&
          (operation.risk === "read" || context.scopes.has("write")),
      )
      .map(([name, operation]) => [
        name,
        Object.assign((input: unknown) => operation.execute(context, input), {
          inputSchema: operation.input,
          doc: {
            signature: `${name}(input)`,
            description: `${operation.summary} ${operation.description}`,
            category: operation.area,
            risk: operation.risk,
          },
        }),
      ]),
  );
}
