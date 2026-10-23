export function optionalBlockReason(form: FormData): { reason?: string } {
  const value = form.get("reason");
  const reason = typeof value === "string" ? value.trim() : "";
  return reason ? { reason } : {};
}
