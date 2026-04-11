import { describe, it, expect } from "vitest";
import type { EventWithDates } from "~/lib/events.server";
import {
  buildEventsMessage,
  buildJobsMessage,
  type JobForDiscord,
} from "~/lib/discord-messages.server";

// =============================================================================
// Helpers — minimal event/job factories
// =============================================================================

const ACCENT_COLOR = 0x2b51d1;
const SITE_URL = "https://siliconharbour.dev";

function makeEvent(overrides: Partial<EventWithDates> = {}): EventWithDates {
  return {
    id: 1,
    slug: "test-event",
    title: "Test Event",
    description: "A test event description",
    location: "St. John's, NL",
    link: "https://example.com/event",
    organizer: "Test Org",
    coverImage: null,
    iconImage: null,
    coverImageUrl: null,
    requiresSignup: false,
    recurrenceRule: null,
    recurrenceStart: null,
    recurrenceEnd: null,
    defaultStartTime: null,
    defaultEndTime: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    importSourceId: null,
    externalId: null,
    importStatus: null,
    firstSeenAt: null,
    lastSeenAt: null,
    dates: [
      {
        id: 1,
        eventId: 1,
        startDate: new Date("2026-04-10T18:00:00Z"),
        endDate: new Date("2026-04-10T20:00:00Z"),
      },
    ],
    ...overrides,
  };
}

function makeJob(overrides: Partial<JobForDiscord> = {}): JobForDiscord {
  return {
    slug: "test-job",
    title: "Senior Developer",
    location: "St. John's, NL",
    workplaceType: "hybrid",
    companyName: "Acme Corp",
    isTechnical: true,
    url: null,
    ...overrides,
  };
}

// =============================================================================
// buildEventsMessage
// =============================================================================

describe("buildEventsMessage", () => {
  it("returns a single container with accent color", () => {
    const result = buildEventsMessage([makeEvent()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("type", 17);
    expect(result[0]).toHaveProperty("color", ACCENT_COLOR);
  });

  it("single event produces text + button components", () => {
    const result = buildEventsMessage([makeEvent()]);
    const container = result[0] as { type: number; components: any[] };
    const components = container.components;

    // Should have a text display (type 10) and an action row (type 1)
    const textDisplays = components.filter((c: any) => c.type === 10);
    const actionRows = components.filter((c: any) => c.type === 1);

    expect(textDisplays.length).toBeGreaterThanOrEqual(1);
    expect(actionRows).toHaveLength(1);

    // Action row should have a "More Info" link button (style 5)
    const button = actionRows[0].components[0];
    expect(button.type).toBe(2);
    expect(button.style).toBe(5);
    expect(button.label).toBe("More Info");
    expect(button.url).toBe(`${SITE_URL}/events/test-event`);
  });

  it("includes event title in bold and location in text", () => {
    const result = buildEventsMessage([makeEvent()]);
    const container = result[0] as { type: number; components: any[] };
    // Find the main text display (either plain type 10 or inside a section type 9)
    const allContent = container.components
      .flatMap((c: any) => (c.type === 9 ? c.components : [c]))
      .filter((c: any) => c.type === 10)
      .map((c: any) => c.content)
      .join("\n");

    expect(allContent).toContain("**Test Event**");
    expect(allContent).toContain("St. John's, NL");
  });

  it("multiple events have separators between them", () => {
    const events = [
      makeEvent({ slug: "event-1", title: "Event 1" }),
      makeEvent({ id: 2, slug: "event-2", title: "Event 2" }),
    ];
    const result = buildEventsMessage(events);
    const container = result[0] as { type: number; components: any[] };
    const separators = container.components.filter((c: any) => c.type === 14);
    // There should be at least one separator between the two events
    expect(separators.length).toBeGreaterThanOrEqual(1);
  });

  it("no separator after the last event", () => {
    const events = [
      makeEvent({ slug: "event-1", title: "Event 1" }),
      makeEvent({ id: 2, slug: "event-2", title: "Event 2" }),
    ];
    const result = buildEventsMessage(events);
    const container = result[0] as { type: number; components: any[] };
    const components = container.components;
    // Last component should be an action row (button), not a separator
    const last = components[components.length - 1];
    expect(last.type).toBe(1); // action row
  });

  it("empty events array returns a container with no inner components", () => {
    const result = buildEventsMessage([]);
    expect(result).toHaveLength(1);
    const container = result[0] as { type: number; components: any[] };
    expect(container.type).toBe(17);
    expect(container.components).toHaveLength(0);
  });

  it("event with coverImageUrl uses section with thumbnail (type 9)", () => {
    const event = makeEvent({
      coverImageUrl: "https://example.com/cover.jpg",
    });
    const result = buildEventsMessage([event]);
    const container = result[0] as { type: number; components: any[] };
    const sections = container.components.filter((c: any) => c.type === 9);
    expect(sections).toHaveLength(1);
    expect(sections[0].accessory.type).toBe(11);
    expect(sections[0].accessory.media.url).toBe("https://example.com/cover.jpg");
  });

  it("event with coverImage (local) constructs full image URL", () => {
    const event = makeEvent({
      coverImage: "my-cover.webp",
      coverImageUrl: null,
    });
    const result = buildEventsMessage([event]);
    const container = result[0] as { type: number; components: any[] };
    const sections = container.components.filter((c: any) => c.type === 9);
    expect(sections).toHaveLength(1);
    expect(sections[0].accessory.media.url).toBe(`${SITE_URL}/images/my-cover.webp`);
  });

  it("event without cover image uses plain text display (type 10)", () => {
    const event = makeEvent({
      coverImage: null,
      coverImageUrl: null,
    });
    const result = buildEventsMessage([event]);
    const container = result[0] as { type: number; components: any[] };
    // No section (type 9) should exist
    const sections = container.components.filter((c: any) => c.type === 9);
    expect(sections).toHaveLength(0);
    // There should be a plain text display
    const texts = container.components.filter((c: any) => c.type === 10);
    expect(texts.length).toBeGreaterThanOrEqual(1);
  });

  it("event without location omits location from subtitle", () => {
    const event = makeEvent({ location: null });
    const result = buildEventsMessage([event]);
    const container = result[0] as { type: number; components: any[] };
    const allContent = container.components
      .flatMap((c: any) => (c.type === 9 ? c.components : [c]))
      .filter((c: any) => c.type === 10)
      .map((c: any) => c.content)
      .join("\n");

    // Should not contain the bullet separator followed by a location
    // The subtitle should just be the date
    expect(allContent).not.toContain("St. John's");
  });

  it("event with no dates shows 'Date TBD'", () => {
    const event = makeEvent({ dates: [] });
    const result = buildEventsMessage([event]);
    const container = result[0] as { type: number; components: any[] };
    const allContent = container.components
      .flatMap((c: any) => (c.type === 9 ? c.components : [c]))
      .filter((c: any) => c.type === 10)
      .map((c: any) => c.content)
      .join("\n");

    expect(allContent).toContain("Date TBD");
  });

  it("custom introText is prepended as text display", () => {
    const result = buildEventsMessage([makeEvent()], "Here are this week's events!");
    const container = result[0] as { type: number; components: any[] };
    const firstComponent = container.components[0];
    expect(firstComponent.type).toBe(10);
    expect(firstComponent.content).toBe("Here are this week's events!");
  });

  it("introText followed by a separator", () => {
    const result = buildEventsMessage([makeEvent()], "Intro text");
    const container = result[0] as { type: number; components: any[] };
    expect(container.components[0].type).toBe(10); // intro text
    expect(container.components[1].type).toBe(14); // separator
  });

  it("empty/whitespace introText is skipped", () => {
    const result = buildEventsMessage([makeEvent()], "   ");
    const container = result[0] as { type: number; components: any[] };
    // First component should not be intro text "   "
    const firstContent = container.components[0];
    // It should go straight to the event content, not a whitespace text
    expect(firstContent.type === 10 || firstContent.type === 9).toBe(true);
    if (firstContent.type === 10) {
      expect(firstContent.content).toContain("**Test Event**");
    }
  });

  it("truncates long descriptions to ~150 chars", () => {
    const longDesc = "A".repeat(200);
    const event = makeEvent({ description: longDesc });
    const result = buildEventsMessage([event]);
    const container = result[0] as { type: number; components: any[] };
    const allContent = container.components
      .flatMap((c: any) => (c.type === 9 ? c.components : [c]))
      .filter((c: any) => c.type === 10)
      .map((c: any) => c.content)
      .join("\n");

    // Should end with "..." and be shorter than the original
    expect(allContent).toContain("...");
    // The "A" portion should be at most 147 chars
    const aMatch = allContent.match(/(A+)/);
    expect(aMatch).toBeTruthy();
    expect(aMatch![1].length).toBeLessThanOrEqual(147);
  });
});

// =============================================================================
// buildJobsMessage
// =============================================================================

describe("buildJobsMessage", () => {
  it("returns a single container with accent color", () => {
    const result = buildJobsMessage([makeJob()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("type", 17);
    expect(result[0]).toHaveProperty("color", ACCENT_COLOR);
  });

  it("technical job has title, subtitle, and Apply button", () => {
    const result = buildJobsMessage([makeJob()]);
    const container = result[0] as { type: number; components: any[] };

    const texts = container.components.filter((c: any) => c.type === 10);
    expect(texts.length).toBeGreaterThanOrEqual(1);
    expect(texts[0].content).toContain("**Senior Developer**");
    expect(texts[0].content).toContain("Acme Corp");
    expect(texts[0].content).toContain("Hybrid"); // capitalized

    const actionRows = container.components.filter((c: any) => c.type === 1);
    expect(actionRows).toHaveLength(1);
    expect(actionRows[0].components[0].label).toBe("Apply");
  });

  it("technical job with external url uses that url for Apply", () => {
    const job = makeJob({ url: "https://example.com/apply" });
    const result = buildJobsMessage([job]);
    const container = result[0] as { type: number; components: any[] };
    const actionRow = container.components.find((c: any) => c.type === 1);
    expect(actionRow.components[0].url).toBe("https://example.com/apply");
  });

  it("technical job without external url falls back to site url", () => {
    const job = makeJob({ url: null });
    const result = buildJobsMessage([job]);
    const container = result[0] as { type: number; components: any[] };
    const actionRow = container.components.find((c: any) => c.type === 1);
    expect(actionRow.components[0].url).toBe(`${SITE_URL}/jobs/test-job`);
  });

  it("mixed technical and non-technical jobs", () => {
    const jobs = [
      makeJob({ slug: "dev", title: "Developer", isTechnical: true }),
      makeJob({
        slug: "sales",
        title: "Sales Rep",
        companyName: "SalesCo",
        isTechnical: false,
      }),
      makeJob({
        slug: "hr",
        title: "HR Manager",
        companyName: "HRCo",
        isTechnical: false,
      }),
    ];
    const result = buildJobsMessage(jobs);
    const container = result[0] as { type: number; components: any[] };

    const allContent = container.components
      .filter((c: any) => c.type === 10)
      .map((c: any) => c.content)
      .join("\n");

    // Technical job title
    expect(allContent).toContain("**Developer**");
    // Non-technical grouped section
    expect(allContent).toContain("**Also hiring**");
    expect(allContent).toContain("Sales Rep - SalesCo");
    expect(allContent).toContain("HR Manager - HRCo");

    // "View All Jobs" button for non-technical section
    const actionRows = container.components.filter((c: any) => c.type === 1);
    const viewAllButton = actionRows.find((ar: any) =>
      ar.components.some((b: any) => b.label === "View All Jobs"),
    );
    expect(viewAllButton).toBeTruthy();
  });

  it("only technical jobs — no 'Also hiring' section", () => {
    const jobs = [
      makeJob({ slug: "dev1", title: "Dev 1", isTechnical: true }),
      makeJob({ slug: "dev2", title: "Dev 2", isTechnical: true }),
    ];
    const result = buildJobsMessage(jobs);
    const container = result[0] as { type: number; components: any[] };

    const allContent = container.components
      .filter((c: any) => c.type === 10)
      .map((c: any) => c.content)
      .join("\n");

    expect(allContent).not.toContain("Also hiring");
    // No "View All Jobs" button
    const viewAllButton = container.components
      .filter((c: any) => c.type === 1)
      .find((ar: any) => ar.components.some((b: any) => b.label === "View All Jobs"));
    expect(viewAllButton).toBeUndefined();
  });

  it("only non-technical jobs — no Apply buttons, only grouped section", () => {
    const jobs = [
      makeJob({
        slug: "sales",
        title: "Sales Rep",
        companyName: "SalesCo",
        isTechnical: false,
      }),
    ];
    const result = buildJobsMessage(jobs);
    const container = result[0] as { type: number; components: any[] };

    const allContent = container.components
      .filter((c: any) => c.type === 10)
      .map((c: any) => c.content)
      .join("\n");

    expect(allContent).toContain("**Also hiring**");
    expect(allContent).toContain("Sales Rep - SalesCo");

    // Only "View All Jobs" button, no "Apply" buttons
    const actionRows = container.components.filter((c: any) => c.type === 1);
    expect(actionRows).toHaveLength(1);
    expect(actionRows[0].components[0].label).toBe("View All Jobs");
  });

  it("non-technical job without company name omits dash", () => {
    const jobs = [
      makeJob({
        slug: "intern",
        title: "Intern",
        companyName: null,
        isTechnical: false,
      }),
    ];
    const result = buildJobsMessage(jobs);
    const container = result[0] as { type: number; components: any[] };
    const allContent = container.components
      .filter((c: any) => c.type === 10)
      .map((c: any) => c.content)
      .join("\n");

    expect(allContent).toContain("Intern");
    expect(allContent).not.toContain("Intern -");
  });

  it("custom introText is prepended", () => {
    const result = buildJobsMessage([makeJob()], "Fresh jobs this week!");
    const container = result[0] as { type: number; components: any[] };
    expect(container.components[0].type).toBe(10);
    expect(container.components[0].content).toBe("Fresh jobs this week!");
    expect(container.components[1].type).toBe(14); // separator
  });

  it("empty jobs array returns container with no components", () => {
    const result = buildJobsMessage([]);
    const container = result[0] as { type: number; components: any[] };
    expect(container.components).toHaveLength(0);
  });

  it("technical job subtitle includes location and workplace type", () => {
    const job = makeJob({
      companyName: "Acme",
      location: "Toronto",
      workplaceType: "remote",
    });
    const result = buildJobsMessage([job]);
    const container = result[0] as { type: number; components: any[] };
    const text = container.components.find((c: any) => c.type === 10);
    expect(text.content).toContain("Acme");
    expect(text.content).toContain("Toronto");
    expect(text.content).toContain("Remote"); // capitalized first letter
  });

  it("separator between technical jobs and non-technical section uses larger spacing", () => {
    const jobs = [
      makeJob({ slug: "dev", title: "Dev", isTechnical: true }),
      makeJob({
        slug: "sales",
        title: "Sales",
        isTechnical: false,
      }),
    ];
    const result = buildJobsMessage(jobs);
    const container = result[0] as { type: number; components: any[] };
    // Find separators with spacing 2 (larger separator between sections)
    const largeSeparators = container.components.filter(
      (c: any) => c.type === 14 && c.spacing === 2,
    );
    expect(largeSeparators.length).toBeGreaterThanOrEqual(1);
  });
});
