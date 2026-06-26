import { describe, expect, it } from "vitest";
import { parseGenesisBlogItems } from "~/lib/news-importers/custom/genesis";

describe("parseGenesisBlogItems", () => {
  it("extracts Genesis Webflow blog cards", () => {
    const html = `
      <div role="listitem" class="w-dyn-item">
        <div class="text-200">June 15, 2026</div>
        <a href="/blog/how-to-find-good-startup-ideas" class="card link-card blog-featured w-inline-block">
          <h3 class="heading-h4-size mg-bottom-0">How To: Find Good Startup Ideas</h3>
        </a>
      </div>
      <a href="/blog" class="nav-link">Blog</a>
      <div role="listitem" class="w-dyn-item">
        <div class="text-200">May 25, 2026</div>
        <a href="/blog/should-you-launch-a-tech-startup" class="card link-card blog-featured w-inline-block">
          <h3 class="heading-h4-size mg-bottom-0">Should You Launch a Tech Startup?</h3>
        </a>
      </div>
    `;

    const items = parseGenesisBlogItems(html);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      sourceItemId: "https://www.genesiscentre.ca/blog/how-to-find-good-startup-ideas",
      title: "How To: Find Good Startup Ideas",
      url: "https://www.genesiscentre.ca/blog/how-to-find-good-startup-ideas",
    });
    expect(items[0].publishedAt?.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(items[1].title).toBe("Should You Launch a Tech Startup?");
  });

  it("deduplicates repeated blog links", () => {
    const html = `
      <a href="/blog/how-to-find-good-startup-ideas"><h3>How To: Find Good Startup Ideas</h3></a>
      <a href="/blog/how-to-find-good-startup-ideas"><h3>How To: Find Good Startup Ideas</h3></a>
    `;

    expect(parseGenesisBlogItems(html)).toHaveLength(1);
  });
});
