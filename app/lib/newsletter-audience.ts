export function newsletterAudience(campaign: { audienceType: string; audienceData: string | null }) {
  if (campaign.audienceType !== "list" || !campaign.audienceData) return { label: "Full list", testCount: null };
  try {
    const value: unknown = JSON.parse(campaign.audienceData);
    if (typeof value === "object" && value !== null && "testSubscriberIds" in value && Array.isArray(value.testSubscriberIds)) {
      const testCount = value.testSubscriberIds.length;
      return { label: `Pilot test · ${testCount} selected`, testCount };
    }
  } catch {
    return { label: "Unknown audience", testCount: null };
  }
  return { label: "Unknown audience", testCount: null };
}
