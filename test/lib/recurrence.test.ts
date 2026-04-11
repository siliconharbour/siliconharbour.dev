import { describe, it, expect } from "vitest";
import {
  parseRecurrenceRule,
  serializeRecurrenceRule,
  generateOccurrences,
  describeRecurrenceRule,
  buildRecurrenceRule,
  extractRecurrenceOptions,
} from "~/lib/recurrence.server";

// Helper: create a noon-UTC date for a given calendar day
function noonUTC(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

// ─── parseRecurrenceRule ─────────────────────────────────────────────
describe("parseRecurrenceRule", () => {
  it("parses a simple weekly rule", () => {
    const rule = parseRecurrenceRule("FREQ=WEEKLY;BYDAY=TH");
    expect(rule).toEqual({
      freq: "WEEKLY",
      interval: 1,
      byDay: "TH",
    });
  });

  it("parses a weekly rule with interval", () => {
    const rule = parseRecurrenceRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=TH");
    expect(rule).toEqual({
      freq: "WEEKLY",
      interval: 2,
      byDay: "TH",
    });
  });

  it("parses monthly with positive position", () => {
    const rule = parseRecurrenceRule("FREQ=MONTHLY;BYDAY=2TH");
    expect(rule).toEqual({
      freq: "MONTHLY",
      interval: 1,
      byDay: "TH",
      byDayPosition: 2,
    });
  });

  it("parses monthly with last (-1) position", () => {
    const rule = parseRecurrenceRule("FREQ=MONTHLY;BYDAY=-1FR");
    expect(rule).toEqual({
      freq: "MONTHLY",
      interval: 1,
      byDay: "FR",
      byDayPosition: -1,
    });
  });

  it("returns null for empty string", () => {
    expect(parseRecurrenceRule("")).toBeNull();
  });

  it("returns null for unsupported frequency", () => {
    expect(parseRecurrenceRule("FREQ=DAILY;BYDAY=TH")).toBeNull();
  });

  it("returns null for invalid BYDAY value", () => {
    expect(parseRecurrenceRule("FREQ=WEEKLY;BYDAY=INVALID")).toBeNull();
  });

  it("returns rule without byDay when BYDAY is missing", () => {
    const rule = parseRecurrenceRule("FREQ=WEEKLY");
    expect(rule).toEqual({
      freq: "WEEKLY",
      interval: 1,
    });
  });
});

// ─── serializeRecurrenceRule ─────────────────────────────────────────
describe("serializeRecurrenceRule", () => {
  it("serializes a simple weekly rule", () => {
    expect(serializeRecurrenceRule({ freq: "WEEKLY", interval: 1, byDay: "TH" })).toBe(
      "FREQ=WEEKLY;BYDAY=TH",
    );
  });

  it("serializes a biweekly rule with interval", () => {
    expect(serializeRecurrenceRule({ freq: "WEEKLY", interval: 2, byDay: "TH" })).toBe(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH",
    );
  });

  it("serializes a monthly rule with position", () => {
    expect(
      serializeRecurrenceRule({
        freq: "MONTHLY",
        interval: 1,
        byDay: "TH",
        byDayPosition: 2,
      }),
    ).toBe("FREQ=MONTHLY;BYDAY=2TH");
  });

  it("serializes a monthly last-weekday rule", () => {
    expect(
      serializeRecurrenceRule({
        freq: "MONTHLY",
        interval: 1,
        byDay: "FR",
        byDayPosition: -1,
      }),
    ).toBe("FREQ=MONTHLY;BYDAY=-1FR");
  });

  it("omits INTERVAL when it is 1", () => {
    const result = serializeRecurrenceRule({
      freq: "WEEKLY",
      interval: 1,
      byDay: "MO",
    });
    expect(result).not.toContain("INTERVAL");
  });

  it("round-trips weekly through parse → serialize", () => {
    const original = "FREQ=WEEKLY;BYDAY=TH";
    const parsed = parseRecurrenceRule(original)!;
    expect(serializeRecurrenceRule(parsed)).toBe(original);
  });

  it("round-trips biweekly through parse → serialize", () => {
    const original = "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH";
    const parsed = parseRecurrenceRule(original)!;
    expect(serializeRecurrenceRule(parsed)).toBe(original);
  });

  it("round-trips monthly through parse → serialize", () => {
    const original = "FREQ=MONTHLY;BYDAY=2TH";
    const parsed = parseRecurrenceRule(original)!;
    expect(serializeRecurrenceRule(parsed)).toBe(original);
  });
});

// ─── generateOccurrences ─────────────────────────────────────────────
describe("generateOccurrences", () => {
  describe("weekly", () => {
    it("generates Thursdays within a 4-week range", () => {
      const rule = parseRecurrenceRule("FREQ=WEEKLY;BYDAY=TH")!;
      // 2026-01-01 is a Thursday
      const start = noonUTC(2026, 1, 1);
      const end = noonUTC(2026, 1, 29);

      const dates = generateOccurrences(rule, start, end);

      // Should include Jan 1, 8, 15, 22, 29
      expect(dates.length).toBe(5);
      for (const d of dates) {
        expect(d.getUTCDay()).toBe(4); // Thursday
      }
      expect(dates[0].getUTCDate()).toBe(1);
      expect(dates[1].getUTCDate()).toBe(8);
      expect(dates[2].getUTCDate()).toBe(15);
      expect(dates[3].getUTCDate()).toBe(22);
      expect(dates[4].getUTCDate()).toBe(29);
    });

    it("advances to the correct weekday if start isn't on target day", () => {
      const rule = parseRecurrenceRule("FREQ=WEEKLY;BYDAY=FR")!;
      // 2026-01-01 is Thursday; first Friday is Jan 2
      const start = noonUTC(2026, 1, 1);
      const end = noonUTC(2026, 1, 16);

      const dates = generateOccurrences(rule, start, end);
      expect(dates.length).toBe(3); // Jan 2, 9, 16
      for (const d of dates) {
        expect(d.getUTCDay()).toBe(5); // Friday
      }
    });

    it("generates biweekly occurrences", () => {
      const rule = parseRecurrenceRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=TH")!;
      const start = noonUTC(2026, 1, 1);
      const end = noonUTC(2026, 2, 28);

      const dates = generateOccurrences(rule, start, end);

      // Every other Thursday starting Jan 1: Jan 1, Jan 15, Jan 29, Feb 12, Feb 26
      expect(dates.length).toBe(5);
      expect(dates[0].getUTCDate()).toBe(1); // Jan 1
      expect(dates[1].getUTCDate()).toBe(15); // Jan 15
      expect(dates[2].getUTCDate()).toBe(29); // Jan 29
    });

    it("respects maxOccurrences limit", () => {
      const rule = parseRecurrenceRule("FREQ=WEEKLY;BYDAY=TH")!;
      const start = noonUTC(2026, 1, 1);
      const end = noonUTC(2026, 12, 31);

      const dates = generateOccurrences(rule, start, end, 3);
      expect(dates.length).toBe(3);
    });

    it("returns empty array when range has no occurrences", () => {
      const rule = parseRecurrenceRule("FREQ=WEEKLY;BYDAY=TH")!;
      // Start after end
      const start = noonUTC(2026, 2, 1);
      const end = noonUTC(2026, 1, 1);

      const dates = generateOccurrences(rule, start, end);
      expect(dates.length).toBe(0);
    });
  });

  describe("monthly", () => {
    it("generates 2nd Thursday of each month", () => {
      const rule = parseRecurrenceRule("FREQ=MONTHLY;BYDAY=2TH")!;
      const start = noonUTC(2026, 1, 1);
      const end = noonUTC(2026, 4, 30);

      const dates = generateOccurrences(rule, start, end);

      // 2nd Thursdays: Jan 8, Feb 12, Mar 12, Apr 9
      expect(dates.length).toBe(4);
      for (const d of dates) {
        expect(d.getUTCDay()).toBe(4); // Thursday
      }
      expect(dates[0].getUTCDate()).toBe(8); // Jan 2026: 2nd Thu = 8th
      expect(dates[1].getUTCDate()).toBe(12); // Feb 2026: 2nd Thu = 12th
      expect(dates[2].getUTCDate()).toBe(12); // Mar 2026: 2nd Thu = 12th
      expect(dates[3].getUTCDate()).toBe(9); // Apr 2026: 2nd Thu = 9th
    });

    it("generates last Friday of each month", () => {
      const rule = parseRecurrenceRule("FREQ=MONTHLY;BYDAY=-1FR")!;
      const start = noonUTC(2026, 1, 1);
      const end = noonUTC(2026, 3, 31);

      const dates = generateOccurrences(rule, start, end);

      // Last Fridays: Jan 30, Feb 27, Mar 27
      expect(dates.length).toBe(3);
      for (const d of dates) {
        expect(d.getUTCDay()).toBe(5); // Friday
      }
      expect(dates[0].getUTCDate()).toBe(30); // Jan 2026 last Fri
      expect(dates[1].getUTCDate()).toBe(27); // Feb 2026 last Fri
      expect(dates[2].getUTCDate()).toBe(27); // Mar 2026 last Fri
    });

    it("generates 1st Thursday of each month", () => {
      const rule = parseRecurrenceRule("FREQ=MONTHLY;BYDAY=1TH")!;
      const start = noonUTC(2026, 1, 1);
      const end = noonUTC(2026, 3, 31);

      const dates = generateOccurrences(rule, start, end);

      // 1st Thursdays: Jan 1, Feb 5, Mar 5
      expect(dates.length).toBe(3);
      expect(dates[0].getUTCDate()).toBe(1); // Jan 2026
      expect(dates[1].getUTCDate()).toBe(5); // Feb 2026
      expect(dates[2].getUTCDate()).toBe(5); // Mar 2026
    });

    it("skips months where the 5th weekday does not exist", () => {
      // 5th Thursday — only exists in months with 5 Thursdays
      const rule: ReturnType<typeof parseRecurrenceRule> = {
        freq: "MONTHLY",
        interval: 1,
        byDay: "TH",
        byDayPosition: 5,
      };
      const start = noonUTC(2026, 1, 1);
      const end = noonUTC(2026, 3, 31);

      const dates = generateOccurrences(rule!, start, end);

      // Jan 2026: 5 Thursdays (1,8,15,22,29) → 5th = 29th ✓
      // Feb 2026: 4 Thursdays → no 5th ✗
      // Mar 2026: 4 Thursdays (5,12,19,26) → no 5th ✗
      expect(dates.length).toBe(1);
      expect(dates[0].getUTCDate()).toBe(29);
    });
  });
});

// ─── describeRecurrenceRule ──────────────────────────────────────────
describe("describeRecurrenceRule", () => {
  it("describes a weekly Thursday rule", () => {
    const rule = parseRecurrenceRule("FREQ=WEEKLY;BYDAY=TH")!;
    expect(describeRecurrenceRule(rule)).toBe("Every Thursday");
  });

  it("describes a biweekly rule", () => {
    const rule = parseRecurrenceRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=TH")!;
    expect(describeRecurrenceRule(rule)).toBe("Every other Thursday");
  });

  it("describes a tri-weekly rule", () => {
    const rule: ReturnType<typeof parseRecurrenceRule> = {
      freq: "WEEKLY",
      interval: 3,
      byDay: "MO",
    };
    expect(describeRecurrenceRule(rule!)).toBe("Every 3 weeks on Monday");
  });

  it("describes a monthly second Thursday rule", () => {
    const rule = parseRecurrenceRule("FREQ=MONTHLY;BYDAY=2TH")!;
    expect(describeRecurrenceRule(rule)).toBe("Second Thursday of every month");
  });

  it("describes a monthly last Friday rule", () => {
    const rule = parseRecurrenceRule("FREQ=MONTHLY;BYDAY=-1FR")!;
    expect(describeRecurrenceRule(rule)).toBe("Last Friday of every month");
  });

  it("describes a monthly first day rule", () => {
    const rule = parseRecurrenceRule("FREQ=MONTHLY;BYDAY=1WE")!;
    expect(describeRecurrenceRule(rule)).toBe("First Wednesday of every month");
  });

  it("describes monthly with interval > 1", () => {
    const rule: ReturnType<typeof parseRecurrenceRule> = {
      freq: "MONTHLY",
      interval: 2,
      byDay: "TU",
      byDayPosition: 3,
    };
    expect(describeRecurrenceRule(rule!)).toBe("Third Tuesday every 2 months");
  });
});

// ─── buildRecurrenceRule ─────────────────────────────────────────────
describe("buildRecurrenceRule", () => {
  it("builds a weekly rule", () => {
    expect(buildRecurrenceRule({ frequency: "weekly", dayOfWeek: "TH" })).toBe(
      "FREQ=WEEKLY;BYDAY=TH",
    );
  });

  it("builds a biweekly rule", () => {
    expect(buildRecurrenceRule({ frequency: "biweekly", dayOfWeek: "TH" })).toBe(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH",
    );
  });

  it("builds a monthly rule with position", () => {
    expect(
      buildRecurrenceRule({
        frequency: "monthly",
        dayOfWeek: "TH",
        monthlyPosition: 2,
      }),
    ).toBe("FREQ=MONTHLY;BYDAY=2TH");
  });

  it("builds a monthly rule with last position", () => {
    expect(
      buildRecurrenceRule({
        frequency: "monthly",
        dayOfWeek: "FR",
        monthlyPosition: -1,
      }),
    ).toBe("FREQ=MONTHLY;BYDAY=-1FR");
  });

  it("defaults monthly position to 1", () => {
    expect(buildRecurrenceRule({ frequency: "monthly", dayOfWeek: "WE" })).toBe(
      "FREQ=MONTHLY;BYDAY=1WE",
    );
  });
});

// ─── extractRecurrenceOptions ────────────────────────────────────────
describe("extractRecurrenceOptions", () => {
  it("extracts weekly options", () => {
    expect(extractRecurrenceOptions("FREQ=WEEKLY;BYDAY=TH")).toEqual({
      frequency: "weekly",
      dayOfWeek: "TH",
      monthlyPosition: 1,
    });
  });

  it("extracts biweekly options", () => {
    expect(extractRecurrenceOptions("FREQ=WEEKLY;INTERVAL=2;BYDAY=TH")).toEqual({
      frequency: "biweekly",
      dayOfWeek: "TH",
      monthlyPosition: 1,
    });
  });

  it("extracts monthly options", () => {
    expect(extractRecurrenceOptions("FREQ=MONTHLY;BYDAY=2TH")).toEqual({
      frequency: "monthly",
      dayOfWeek: "TH",
      monthlyPosition: 2,
    });
  });

  it("returns defaults for invalid input", () => {
    expect(extractRecurrenceOptions("")).toEqual({
      frequency: "none",
      dayOfWeek: "TH",
      monthlyPosition: 1,
    });
  });

  it("round-trips weekly through build → extract", () => {
    const built = buildRecurrenceRule({
      frequency: "weekly",
      dayOfWeek: "FR",
    });
    const extracted = extractRecurrenceOptions(built);
    expect(extracted).toEqual({
      frequency: "weekly",
      dayOfWeek: "FR",
      monthlyPosition: 1,
    });
  });

  it("round-trips biweekly through build → extract", () => {
    const built = buildRecurrenceRule({
      frequency: "biweekly",
      dayOfWeek: "MO",
    });
    const extracted = extractRecurrenceOptions(built);
    expect(extracted).toEqual({
      frequency: "biweekly",
      dayOfWeek: "MO",
      monthlyPosition: 1,
    });
  });

  it("round-trips monthly through build → extract", () => {
    const built = buildRecurrenceRule({
      frequency: "monthly",
      dayOfWeek: "TH",
      monthlyPosition: 2,
    });
    const extracted = extractRecurrenceOptions(built);
    expect(extracted).toEqual({
      frequency: "monthly",
      dayOfWeek: "TH",
      monthlyPosition: 2,
    });
  });
});
