export function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message;
  if (typeof err === "string") return err;
  if (err == null) return "Unknown error";

  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    const parts = [record.name, record.message, record.stack, record.code]
      .filter(
        (value): value is string | number => typeof value === "string" || typeof value === "number",
      )
      .map(String)
      .filter(Boolean);
    if (parts.length > 0) return parts.join("\n");

    try {
      const json = JSON.stringify(err, null, 2);
      if (json && json !== "{}") return json;
    } catch {}
  }

  return String(err);
}
