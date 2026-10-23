const VERAFIN_SOURCE_ID = 3;
const VERAFIN_SOURCE_IDENTIFIER = "nasdaq:Global_External_Site:verafin";

export function defaultLastVerifiedMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isVerafinManualSource(source: {
  id: number;
  sourceType: string;
  sourceIdentifier: string;
}): boolean {
  return (
    source.id === VERAFIN_SOURCE_ID &&
    source.sourceType === "workday" &&
    source.sourceIdentifier === VERAFIN_SOURCE_IDENTIFIER
  );
}
