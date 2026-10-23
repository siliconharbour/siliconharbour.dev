import { z } from "zod";

export function parseKeywords(value: string | null | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    : [];
}
export const keywordList = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(10000)
      .refine((value) => !value.includes(","), "A keyword must not contain a comma"),
  )
  .max(1000)
  .refine((values) => values.join(",").length <= 10000, "Keyword list exceeds 10000 characters");
