import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPage } from "../../app/lib/job-importers/custom/utils";

describe("custom job importer utilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches career pages with a browser-like user agent", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("<html></html>"));

    await fetchPage("https://example.com/careers");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/careers",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "text/html",
          "User-Agent": expect.stringContaining("Mozilla/5.0"),
        }),
      }),
    );
  });
});
