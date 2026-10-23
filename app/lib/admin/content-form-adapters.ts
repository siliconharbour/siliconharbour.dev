import { parseKeywords } from "~/lib/keywords";
import { checkbox, imageFromForm } from "./form-adapters";
export function jobFormInput(form: FormData) {
  const input: Record<string, unknown> = {};
  for (const key of ["title", "description", "url", "location", "department", "salaryRange"])
    input[key] = form.get(key) ?? null;
  input.companyId = form.get("companyId") ? Number(form.get("companyId")) : null;
  input.workplaceType = form.get("workplaceType") || null;
  if (form.has("isTechnicalPresent") || form.has("isTechnical"))
    input.isTechnical = checkbox(form, "isTechnical");
  return input;
}
export function newsFormInput(form: FormData, editing: boolean) {
  const input: Record<string, unknown> = {
    title: form.get("title"),
    content: form.get("content") ?? "",
    excerpt: form.get("excerpt") ?? null,
    status: form.get("status") ?? "draft",
    coverImage: imageFromForm(form, "coverImage", editing),
  };
  if (editing && form.has("externalUrl") && !form.get("content")) delete input.content;
  if (!editing) input.type = form.get("type") || "article";
  for (const key of ["externalUrl", "sourceName"]) if (form.has(key)) input[key] = form.get(key);
  return input;
}
export function newsSourceFormInput(form: FormData, editing: boolean) {
  const input: Record<string, unknown> = {};
  for (const key of [
    "name",
    "sourceUrl",
    "sourceIdentifier",
    "keywords",
    "excerptMode",
    "entityUrl",
  ])
    if (form.has(key))
      input[key] = key === "keywords" ? parseKeywords(String(form.get(key) ?? "")) : form.get(key);
  if (!editing) input.sourceType = form.get("sourceType");
  for (const key of ["useGlobalKeywords", "useCompanyNameFilter", "enabled"])
    input[key] = checkbox(form, key);
  return input;
}
