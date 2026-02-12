export type TechnologyEvidenceSourceType = "job_posting" | "survey" | "manual";

export function normalizeTechnologyEvidenceSourceLabel(
  sourceType: TechnologyEvidenceSourceType,
  sourceLabel: string | null,
): string | null {
  if (sourceType === "job_posting") {
    return "Job Postings";
  }

  const trimmed = sourceLabel?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function getTechnologyEvidenceGroupKey(
  sourceType: TechnologyEvidenceSourceType,
  sourceLabel: string | null,
  sourceUrl: string | null,
  lastVerified: string | null,
): string {
  if (sourceType === "job_posting") {
    return "job_posting";
  }

  return `${sourceType}|${sourceLabel ?? ""}|${sourceUrl ?? ""}|${lastVerified ?? ""}`;
}
