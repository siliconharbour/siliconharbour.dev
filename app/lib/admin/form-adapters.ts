import { socialLinkKeys, projectLinkKeys } from "~/lib/links";
import { personFields } from "~/operations/contracts/people";
import { companyFields } from "~/operations/contracts/companies";
import { educationFields } from "~/operations/contracts/education";
import { groupFields } from "~/operations/contracts/groups";
import { productFields } from "~/operations/contracts/products";
import { projectFields } from "~/operations/contracts/projects";
import { technologyFields } from "~/operations/contracts/technologies";

const fields = {
  person: personFields,
  company: companyFields,
  education: educationFields,
  group: groupFields,
  product: productFields,
  project: projectFields,
  technology: technologyFields,
};
export type DirectoryType = keyof typeof fields;
const booleans = new Set(["visible", "technl", "genesis", "bounce", "newsFilterInclude"]);
const imageFields = {
  avatar: ["avatarData", "existingAvatar"],
  logo: ["logoData", "existingLogo"],
  coverImage: ["coverImageData", "existingCoverImage"],
  icon: ["iconData", "existingIcon"],
} as const;

export function checkbox(form: FormData, name: string): boolean {
  return ["on", "true"].includes(String(form.get(name)));
}
export function imageFromForm(form: FormData, field: keyof typeof imageFields, editing: boolean) {
  const [upload, existing] = imageFields[field];
  const data = form.get(upload);
  if (typeof data === "string" && data)
    return { kind: "dataUrl" as const, confirm: true, dataUrl: data };
  if (field === "coverImage" && checkbox(form, "generateCoverFromIcon"))
    return { kind: "generateFromIcon" as const, confirm: true };
  if (editing && form.has(existing))
    return form.get(existing)
      ? { kind: "keep" as const }
      : { kind: "clear" as const, confirm: true };
  return undefined;
}

export function directoryFormInput(
  type: DirectoryType,
  form: FormData,
  editing: boolean,
  selectedFields?: string[],
) {
  const input: Record<string, unknown> = {};
  for (const name of selectedFields ?? Object.keys(fields[type])) {
    if (name in imageFields) {
      const image = imageFromForm(form, name as keyof typeof imageFields, editing);
      if (image) input[name] = image;
    } else if (booleans.has(name)) {
      input[name] = name === "visible" && !editing && !form.has(name) ? true : checkbox(form, name);
    } else if (name === "companyId") {
      input[name] = form.get(name) ? Number(form.get(name)) : null;
    } else if (name === "socialLinks" || name === "links") {
      const keys = name === "socialLinks" ? socialLinkKeys : projectLinkKeys;
      const values = Object.fromEntries(
        keys
          .filter((key) => form.has(key))
          .map((key) => [key, String(form.get(key) ?? "").trim() || null]),
      );
      if (Object.keys(values).length) input[name] = values;
    } else if (name === "technologyIds") {
      if (editing) input[name] = form.getAll("technologies").map(Number);
    } else if (name === "evidenceGroups") {
      if (editing)
        input[name] = form.getAll("provenanceGroupId").map((group) => ({
          technologyIds: form.getAll(`provenanceTech_${group}`).map(Number),
          sourceKey: form.get(`provenanceSourceKey_${group}`) || "get_coding_reference",
          sourceUrl: form.get(`provenanceSourceUrl_${group}`) || null,
          lastVerified: form.get(`provenanceLastVerified_${group}`) || null,
          excerptText: form.get(`provenanceExcerpt_${group}`) || null,
          jobIds: form.getAll(`provenanceJobs_${group}`).map(Number),
        }));
    } else if (form.has(name)) input[name] = form.get(name);
  }
  return input;
}
