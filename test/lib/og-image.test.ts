import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  generateOGImage,
  prepareEventOGData,
  prepareNewsOGData,
} from "~/lib/og-image.server";

describe("OG image data", () => {
  it("prepares all-day events without adding a clock time", () => {
    const data = prepareEventOGData({
      title: "Community Day",
      dates: [{ startDate: new Date("2026-09-12T12:00:00Z"), isAllDay: true }],
      location: "St. John's",
      coverImage: "community-day.webp",
    });

    expect(data).toMatchObject({
      title: "Community Day",
      type: "event",
      subtitle: "St. John's",
      coverImagePath: "community-day.webp",
    });
    expect(data.date).not.toMatch(/AM|PM/);
  });

  it("uses the source name as the subtitle for link news", () => {
    expect(
      prepareNewsOGData({ title: "Local Story", type: "link", sourceName: "VOCM" }),
    ).toMatchObject({ title: "Local Story", type: "news", subtitle: "VOCM" });
  });
});

describe("OG rendering", () => {
  it("renders the standard 1200 by 630 social image dimensions", async () => {
    const image = await generateOGImage(`vitest-${Date.now()}`, {
      title: "A deliberately long title that exercises the compact social card typography",
      date: "Saturday, September 12, 2026",
      subtitle: "St. John's, NL",
      type: "event",
    });

    const metadata = await sharp(image).metadata();
    expect(metadata).toMatchObject({ width: 1200, height: 630, format: "png" });
  });
});
