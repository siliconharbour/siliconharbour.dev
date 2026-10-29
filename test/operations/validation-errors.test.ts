import { expect, it } from "vitest";
import { z } from "zod";
import { formatValidationError } from "~/operations/fields";
it("reports allowed fields at the failing nested object or union variant", () => {
  const schema = z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("person"),
        name: z.string(),
        externalLinks: z
          .object({ twitter: z.string().optional(), linkedin: z.string().optional() })
          .strict(),
      })
      .strict(),
    z
      .object({
        type: z.literal("event"),
        dates: z.array(
          z.object({ startDate: z.string(), endDate: z.string().optional() }).strict(),
        ),
      })
      .strict(),
  ]);
  const person = { type: "person", name: "Person", externalLinks: { bogus: "value" } };
  const parsed = schema.safeParse(person);
  if (parsed.success) throw new Error("Expected validation failure");
  const message = formatValidationError(parsed.error, schema, person);
  expect(message).toContain("`bogus`");
  expect(message).toContain("Allowed: twitter, linkedin");
  const event = { type: "event", dates: [{ startDate: "2026-11-01", bogus: 1 }] };
  const dates = schema.safeParse(event);
  if (dates.success) throw new Error("Expected validation failure");
  expect(formatValidationError(dates.error, schema, event)).toContain(
    "Allowed: startDate, endDate",
  );
});
