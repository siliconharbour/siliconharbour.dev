import { describe, it, expect } from "vitest";
import {
  formatInTimezone,
  parseAsTimezone,
  getTimeInTimezone,
  getDateInTimezone,
  SITE_TIMEZONE,
} from "~/lib/timezone";

describe("SITE_TIMEZONE", () => {
  it("is America/St_Johns", () => {
    expect(SITE_TIMEZONE).toBe("America/St_Johns");
  });
});

// ─── formatInTimezone ────────────────────────────────────────────────
describe("formatInTimezone", () => {
  it("formats UTC noon as 8:30 AM NDT in summer", () => {
    // 2026-07-15 12:00 UTC → NDT is UTC-2:30 → 09:30 local
    const utcNoon = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
    expect(formatInTimezone(utcNoon, "HH:mm")).toBe("09:30");
  });

  it("formats UTC noon as 8:30 AM NST in winter", () => {
    // 2026-01-15 12:00 UTC → NST is UTC-3:30 → 08:30 local
    const utcNoon = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(formatInTimezone(utcNoon, "HH:mm")).toBe("08:30");
  });

  it("formats a full date string correctly in winter", () => {
    // 2026-02-10 20:00 UTC → NST (UTC-3:30) → 16:30 Feb 10
    const date = new Date(Date.UTC(2026, 1, 10, 20, 0, 0));
    expect(formatInTimezone(date, "yyyy-MM-dd HH:mm")).toBe("2026-02-10 16:30");
  });

  it("handles date rollover due to timezone offset", () => {
    // 2026-06-15 01:00 UTC → NDT (UTC-2:30) → Jun 14, 22:30
    const date = new Date(Date.UTC(2026, 5, 15, 1, 0, 0));
    expect(formatInTimezone(date, "yyyy-MM-dd HH:mm")).toBe("2026-06-14 22:30");
  });
});

// ─── parseAsTimezone ─────────────────────────────────────────────────
describe("parseAsTimezone", () => {
  it("parses winter date (NST = UTC-3:30) correctly", () => {
    // 2026-01-15 18:00 NST → should be 21:30 UTC
    const result = parseAsTimezone("2026-01-15", "18:00");
    expect(result.toISOString()).toBe("2026-01-15T21:30:00.000Z");
  });

  it("parses summer date (NDT = UTC-2:30) correctly", () => {
    // 2026-07-15 18:00 NDT → should be 20:30 UTC
    const result = parseAsTimezone("2026-07-15", "18:00");
    expect(result.toISOString()).toBe("2026-07-15T20:30:00.000Z");
  });

  it("parses midnight correctly", () => {
    // 2026-01-15 00:00 NST → 03:30 UTC
    const result = parseAsTimezone("2026-01-15", "00:00");
    expect(result.toISOString()).toBe("2026-01-15T03:30:00.000Z");
  });

  it("round-trips through format and parse", () => {
    const original = parseAsTimezone("2026-03-20", "14:30");
    const dateStr = getDateInTimezone(original);
    const timeStr = getTimeInTimezone(original);
    const roundTripped = parseAsTimezone(dateStr, timeStr);
    expect(roundTripped.getTime()).toBe(original.getTime());
  });
});

// ─── getTimeInTimezone ───────────────────────────────────────────────
describe("getTimeInTimezone", () => {
  it("returns correct Newfoundland time for a UTC date in winter", () => {
    // 2026-01-15 21:30 UTC → NST (UTC-3:30) → 18:00
    const date = new Date(Date.UTC(2026, 0, 15, 21, 30, 0));
    expect(getTimeInTimezone(date)).toBe("18:00");
  });

  it("returns correct Newfoundland time for a UTC date in summer", () => {
    // 2026-07-15 20:30 UTC → NDT (UTC-2:30) → 18:00
    const date = new Date(Date.UTC(2026, 6, 15, 20, 30, 0));
    expect(getTimeInTimezone(date)).toBe("18:00");
  });

  it("handles the half-hour offset correctly", () => {
    // 2026-01-15 15:00 UTC → NST (UTC-3:30) → 11:30
    const date = new Date(Date.UTC(2026, 0, 15, 15, 0, 0));
    expect(getTimeInTimezone(date)).toBe("11:30");
  });
});

// ─── getDateInTimezone ───────────────────────────────────────────────
describe("getDateInTimezone", () => {
  it("returns correct Newfoundland date in same calendar day", () => {
    // 2026-01-15 12:00 UTC → NST 08:30 → still Jan 15
    const date = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(getDateInTimezone(date)).toBe("2026-01-15");
  });

  it("handles date rollback due to half-hour offset", () => {
    // 2026-01-15 02:00 UTC → NST (UTC-3:30) → Jan 14, 22:30
    const date = new Date(Date.UTC(2026, 0, 15, 2, 0, 0));
    expect(getDateInTimezone(date)).toBe("2026-01-14");
  });

  it("handles summer offset date rollback", () => {
    // 2026-07-15 01:30 UTC → NDT (UTC-2:30) → Jul 14, 23:00
    const date = new Date(Date.UTC(2026, 6, 15, 1, 30, 0));
    expect(getDateInTimezone(date)).toBe("2026-07-14");
  });

  it("does not roll back when UTC time is after offset", () => {
    // 2026-07-15 04:00 UTC → NDT (UTC-2:30) → Jul 15, 01:30
    const date = new Date(Date.UTC(2026, 6, 15, 4, 0, 0));
    expect(getDateInTimezone(date)).toBe("2026-07-15");
  });
});
