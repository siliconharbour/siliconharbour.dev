export type TechnologyEvidenceSourceType = "job_posting" | "survey" | "manual";
export type TechnologyProvenanceSourceKey = "job_postings" | "get_coding_reference";
export const GET_CODING_REFERENCE_URL =
  "https://docs.google.com/spreadsheets/d/1zEpwpRtq_T4bfmG51_esZ8QJZhvM13iA0aahAuCZEX8/edit?gid=0#gid=0";

export interface TechnologyProvenanceSourceDefinition {
  key: TechnologyProvenanceSourceKey;
  label: string;
  sourceType: TechnologyEvidenceSourceType;
  sourceUrl: string | null;
}

export const technologyProvenanceSourceOptions: TechnologyProvenanceSourceDefinition[] = [
  {
    key: "job_postings",
    label: "Job Postings",
    sourceType: "job_posting",
    sourceUrl: null,
  },
  {
    key: "get_coding_reference",
    label: "Get Coding Reference",
    sourceType: "manual",
    sourceUrl: GET_CODING_REFERENCE_URL,
  },
];

const sourceByKey = new Map(
  technologyProvenanceSourceOptions.map((option) => [option.key, option]),
);

export function getTechnologyProvenanceSourceByKey(
  key: string | null | undefined,
): TechnologyProvenanceSourceDefinition {
  if (key === "coding_reference") {
    return sourceByKey.get("get_coding_reference")!;
  }
  return sourceByKey.get((key ?? "") as TechnologyProvenanceSourceKey)
    ?? sourceByKey.get("get_coding_reference")!;
}

export function inferTechnologyProvenanceSourceKey(
  sourceType: TechnologyEvidenceSourceType,
  sourceLabel: string | null,
): TechnologyProvenanceSourceKey {
  if (sourceType === "job_posting") {
    return "job_postings";
  }

  const normalized = sourceLabel?.trim().toLowerCase() ?? "";
  if (normalized === "job postings") {
    return "job_postings";
  }

  return "get_coding_reference";
}

export function normalizeTechnologyEvidenceSourceLabel(
  sourceType: TechnologyEvidenceSourceType,
  sourceLabel: string | null,
): string | null {
  return getTechnologyProvenanceSourceByKey(inferTechnologyProvenanceSourceKey(sourceType, sourceLabel)).label;
}

export function getTechnologyEvidenceGroupKey(
  sourceType: TechnologyEvidenceSourceType,
  sourceLabel: string | null,
  _sourceUrl: string | null,
  _lastVerified: string | null,
): string {
  return inferTechnologyProvenanceSourceKey(sourceType, sourceLabel);
}
