import { z } from "zod";
import type { OperationContext } from "./context";
import { ConfirmationRequiredError, ForbiddenError } from "./errors";

export type OperationRisk = "read" | "write" | "destructive" | "external";
export type OperationArea =
  | "people"
  | "companies"
  | "education"
  | "groups"
  | "products"
  | "projects"
  | "technologies"
  | "events"
  | "jobs"
  | "news"
  | "comments"
  | "config"
  | "discord"
  | "newsletter"
  | "blocklist"
  | "importers"
  | "images"
  | "export"
  | "theme-shares"
  | "dashboard";

export interface OperationDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: string;
  area: OperationArea;
  summary: string;
  description: string;
  risk: OperationRisk;
  access: "public" | "admin";
  input: I;
  output: O;
  examples: Array<{ title: string; input: z.input<I> }>;
  run(ctx: OperationContext, input: z.output<I>): z.output<O> | Promise<z.output<O>>;
}

export function defineOperation<I extends z.ZodType, O extends z.ZodType>(
  definition: OperationDefinition<I, O>,
) {
  const { run, ...metadata } = definition;
  return {
    ...metadata,
    async execute(context: OperationContext, raw: unknown): Promise<z.output<O>> {
      if (definition.access === "admin" && context.actor?.role !== "admin")
        throw new ForbiddenError("Administrator access required");
      if (!context.scopes.has(definition.risk === "read" ? "read" : "write"))
        throw new ForbiddenError(`${definition.risk === "read" ? "Read" : "Write"} scope required`);
      if (
        (definition.risk === "destructive" || definition.risk === "external") &&
        (typeof raw !== "object" || raw === null || !("confirm" in raw) || raw.confirm !== true)
      )
        throw new ConfirmationRequiredError("confirm: true is required");
      return run(context, definition.input.parse(raw));
    },
  };
}

export type Operation = ReturnType<typeof defineOperation>;
