import { InvalidOperationError } from "~/operations/errors";
export function jsonFromForm(form: FormData, name: string): unknown {
  const value = form.get(name);
  if (typeof value !== "string") throw new InvalidOperationError(`${name} is required`);
  try {
    return JSON.parse(value);
  } catch {
    throw new InvalidOperationError(`${name} must contain valid JSON`);
  }
}
