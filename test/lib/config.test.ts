import { describe, it, expect } from "vitest";
import {
  isSectionVisible,
  setSectionVisibility,
  getVisibleSections,
  areCommentsEnabled,
  setCommentVisibility,
} from "~/lib/config.server";
import { sectionKeys } from "~/db/schema";

// =============================================================================
// Section visibility
// =============================================================================

describe("isSectionVisible / setSectionVisibility", () => {
  it("sections are visible by default (no config row)", async () => {
    const visible = await isSectionVisible("events");
    expect(visible).toBe(true);
  });

  it("set section hidden → isSectionVisible returns false", async () => {
    await setSectionVisibility("companies", false);
    const visible = await isSectionVisible("companies");
    expect(visible).toBe(false);
  });

  it("set section visible again → returns true", async () => {
    await setSectionVisibility("groups", false);
    expect(await isSectionVisible("groups")).toBe(false);

    await setSectionVisibility("groups", true);
    expect(await isSectionVisible("groups")).toBe(true);
  });
});

describe("getVisibleSections", () => {
  it("returns all sections by default", async () => {
    const visible = await getVisibleSections();
    // All sectionKeys should be visible when nothing is configured
    expect(visible).toEqual([...sectionKeys]);
  });

  it("excludes hidden sections", async () => {
    await setSectionVisibility("events", false);
    await setSectionVisibility("jobs", false);

    const visible = await getVisibleSections();
    expect(visible).not.toContain("events");
    expect(visible).not.toContain("jobs");
    // The rest should still be there
    expect(visible).toContain("companies");
    expect(visible).toContain("groups");
    expect(visible).toContain("news");
  });
});

// =============================================================================
// Comment visibility
// =============================================================================

describe("areCommentsEnabled / setCommentVisibility", () => {
  it("comments are enabled by default (no config row)", async () => {
    const enabled = await areCommentsEnabled("companies");
    expect(enabled).toBe(true);
  });

  it("disable comments → areCommentsEnabled returns false", async () => {
    await setCommentVisibility("news", false);
    const enabled = await areCommentsEnabled("news");
    expect(enabled).toBe(false);
  });

  it("re-enable comments → areCommentsEnabled returns true", async () => {
    await setCommentVisibility("groups", false);
    expect(await areCommentsEnabled("groups")).toBe(false);

    await setCommentVisibility("groups", true);
    expect(await areCommentsEnabled("groups")).toBe(true);
  });
});
