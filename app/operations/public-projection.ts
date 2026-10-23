import type { z } from "zod";

export function publicProjection<S extends z.ZodObject>(
  schema: S,
  value: z.output<S>,
): z.output<S> {
  return Object.fromEntries(
    Object.keys(schema.shape)
      .filter((key) => key in value)
      .map((key) => [key, value[key]]),
  ) as z.output<S>;
}
