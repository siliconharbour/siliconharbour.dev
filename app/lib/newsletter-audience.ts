import type { Campaign } from "./newsletter.server";

export function newsletterAudience(campaign: Pick<Campaign, "audienceType" | "audienceData">) {
  if (campaign.audienceType === "list" && campaign.audienceData === null)
    return { label: "Full list", testCount: null };
  if (campaign.audienceData && !Array.isArray(campaign.audienceData)) {
    const testCount = campaign.audienceData.testSubscriberIds.length;
    return { label: `Pilot test · ${testCount} selected`, testCount };
  }
  return { label: "Selected subscribers", testCount: null };
}
