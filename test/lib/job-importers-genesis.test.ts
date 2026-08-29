import { describe, expect, it } from "vitest";
import { parseGenesisCareers } from "../../app/lib/job-importers/custom/genesis";

describe("Genesis job importer", () => {
  it("treats the explicit Webflow empty state as a healthy empty listing", () => {
    const html = `
      <section id="careers">
        <h2>Browse our open positions</h2>
        <div class="w-dyn-list">
          <div class="empty-state w-dyn-empty"><div>No items found.</div></div>
        </div>
      </section>`;

    expect(parseGenesisCareers(html)).toEqual([]);
  });

  it("parses populated Webflow collection items", () => {
    const html = `
      <section id="careers">
        <div class="w-dyn-list"><div class="w-dyn-items">
          <div class="w-dyn-item">
            <a href="/careers/community-manager"><h3>Community Manager</h3></a>
            <p>Help founders build great companies.</p>
          </div>
        </div></div>
      </section>`;

    expect(parseGenesisCareers(html)).toEqual([
      expect.objectContaining({
        title: "Community Manager",
        url: "https://www.genesiscentre.ca/careers/community-manager",
        descriptionText: expect.stringContaining("Help founders"),
      }),
    ]);
  });

  it("fails loudly when the expected careers markup disappears", () => {
    expect(() => parseGenesisCareers("<main>Redesigned page</main>")).toThrow(
      "careers section was not found",
    );
  });
});
