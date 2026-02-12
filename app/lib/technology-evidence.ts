export type TechnologyEvidenceSourceType = "job_posting" | "survey" | "manual";
export type TechnologyProvenanceSourceKey = "job_postings" | "coding_reference";

export interface TechnologyProvenanceSourceDefinition {
  key: TechnologyProvenanceSourceKey;
  label: string;
  sourceType: TechnologyEvidenceSourceType;
  sourceLabel: string;
}

export const technologyProvenanceSourceOptions: TechnologyProvenanceSourceDefinition[] = [
  {
    key: "job_postings",
    label: "Job Postings",
    sourceType: "job_posting",
    sourceLabel: "Job Postings",
  },
  {
    key: "coding_reference",
    label: "Coding Reference",
    sourceType: "manual",
    sourceLabel: "Coding Reference",
  },
];

const sourceByKey = new Map(
  technologyProvenanceSourceOptions.map((option) => [option.key, option]),
);

export function getTechnologyProvenanceSourceByKey(
  key: string | null | undefined,
): TechnologyProvenanceSourceDefinition {
  return sourceByKey.get((key ?? "") as TechnologyProvenanceSourceKey) ?? sourceByKey.get("coding_reference")!;
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

  return "coding_reference";
}

export function normalizeTechnologyEvidenceSourceLabel(
  sourceType: TechnologyEvidenceSourceType,
  sourceLabel: string | null,
): string | null {
  return getTechnologyProvenanceSourceByKey(
    inferTechnologyProvenanceSourceKey(sourceType, sourceLabel),
  ).sourceLabel;
}

export function getTechnologyEvidenceGroupKey(
  sourceType: TechnologyEvidenceSourceType,
  sourceLabel: string | null,
  _sourceUrl: string | null,
  _lastVerified: string | null,
): string {
  return inferTechnologyProvenanceSourceKey(sourceType, sourceLabel);
}
