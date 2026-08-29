import { describe, expect, it } from "vitest";
import { parseKyrixDetail, parseKyrixListing } from "../../app/lib/job-importers/kyrix.server";

describe("Kyrix importer", () => {
  it("parses listing cards and ignores duplicate action links", () => {
    const html = `
      <div class="bg-white">
        <h2><a href="/j/9316ejt0/31">Business Development Manager — Mysa HQ</a></h2>
        <div class="text-sm text-gray-500"><span>Mysa</span><span>•</span><span>Canada (Remote-friendly)</span></div>
        <div>Posted 01 May 2026</div>
        <a href="/j/9316ejt0/31">View Position</a>
      </div>`;

    expect(parseKyrixListing(html, "9316ejt0")).toEqual([
      expect.objectContaining({
        externalId: "31",
        title: "Business Development Manager — Mysa HQ",
        location: "Canada (Remote-friendly)",
        url: "https://www.kyrix.ai/j/9316ejt0/31",
        workplaceType: "remote",
        postedAt: new Date("2026-05-01T00:00:00.000Z"),
      }),
    ]);
  });

  it("extracts the job description from the detail page", () => {
    const detail = parseKyrixDetail(`
      <div class="prose prose-indigo max-w-none"><h2>The Opportunity</h2><p>Build things.</p></div>
      <div class="prose">Requirements that are not part of the description.</div>`);

    expect(detail.descriptionHtml).toContain("The Opportunity");
    expect(detail.descriptionText).toContain("Build things.");
    expect(detail.descriptionText).not.toContain("Requirements that are not part");
  });
});
