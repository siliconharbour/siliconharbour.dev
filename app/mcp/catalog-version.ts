import { createHash } from "node:crypto";
import { z } from "zod";
import { operationCatalog } from "~/operations/catalog";
let version: string | undefined;
export function catalogVersion() {
  return (version ??= `3.0.0+${createHash("sha256")
    .update(
      JSON.stringify(
        Object.values(operationCatalog)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((operation) => [
            operation.name,
            operation.access,
            operation.risk,
            z.toJSONSchema(operation.input, { io: "input", unrepresentable: "any" }),
            z.toJSONSchema(operation.output, { io: "output", unrepresentable: "any" }),
          ]),
      ),
    )
    .digest("hex")
    .slice(0, 12)}`);
}
