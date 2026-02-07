import { z } from "zod";

function getSingleValue(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function coerceNullIfEmpty(value: FormDataEntryValue | null): string | null {
  const trimmed = getSingleValue(value);
  return trimmed.length > 0 ? trimmed : null;
}

export const zRequiredString = (fieldLabel: string) =>
  z.string().trim().min(1, `${fieldLabel} is required`);

export const zNullableString = z.string().trim().nullable();

export const zOptionalNullableString = z.preprocess(
  (value) => {
    if (value === undefined) return null;
    if (value === null) return null;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().nullable(),
);

export const zCheckboxBoolean = z.preprocess((value) => value === "on", z.boolean());
export const zTrueBoolean = z.preprocess((value) => value === "true", z.boolean());

export const zNullableInt = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : value;
}, z.number().int().nullable());

export function getString(formData: FormData, key: string): string {
  return getSingleValue(formData.get(key));
}

export function getNullableString(formData: FormData, key: string): string | null {
  return coerceNullIfEmpty(formData.get(key));
}

export function getCheckboxBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

export function getTrueBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === "true";
}

export function parseFormData<T>(
  formData: FormData,
  schema: z.ZodType<T>,
): { success: true; data: T } | { success: false; error: string } {
  const values: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    values[key] = value;
  }

  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { success: false, error: firstIssue?.message ?? "Invalid form data" };
  }

  return { success: true, data: parsed.data };
}
