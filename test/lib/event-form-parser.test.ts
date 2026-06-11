/**
 * Coverage for parseOneTimeEventDates — the form -> Date conversion used
 * by both the manage/events/new and manage/events/{id} actions. Locks
 * in the all-day vs timed semantics introduced in s-7e3b so a future
 * change can't silently drop the flag.
 */

import { describe, expect, it } from "vitest";
import { parseOneTimeEventDates } from "~/lib/admin/manage-schemas";

function build(rows: Array<Record<string, string>>): FormData {
  const fd = new FormData();
  rows.forEach((row, i) => {
    for (const [k, v] of Object.entries(row)) {
      fd.set(`dates[${i}][${k}]`, v);
    }
  });
  return fd;
}

describe("parseOneTimeEventDates", () => {
  it("parses a timed event with start time only", () => {
    const fd = build([
      { startDate: "2026-12-31", startTime: "18:00", hasEnd: "0", isAllDay: "0" },
    ]);
    const r = parseOneTimeEventDates(fd);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0].isAllDay).toBe(false);
    expect(r.data[0].endDate).toBeNull();
  });

  it("parses a timed event with start + end time on the same day", () => {
    const fd = build([
      {
        startDate: "2026-12-31",
        startTime: "18:00",
        hasEnd: "1",
        endDate: "2026-12-31",
        endTime: "21:00",
        isAllDay: "0",
      },
    ]);
    const r = parseOneTimeEventDates(fd);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data[0].endDate).not.toBeNull();
    expect(r.data[0].isAllDay).toBe(false);
  });

  it("parses an all-day event and ignores the time inputs", () => {
    const fd = build([
      {
        startDate: "2026-07-15",
        startTime: "", // empty, allowed under isAllDay
        hasEnd: "0",
        isAllDay: "1",
      },
    ]);
    const r = parseOneTimeEventDates(fd);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data[0].isAllDay).toBe(true);
    expect(r.data[0].endDate).toBeNull();
  });

  it("parses a multi-day all-day event using only the end date", () => {
    const fd = build([
      {
        startDate: "2026-07-15",
        startTime: "",
        hasEnd: "1",
        endDate: "2026-07-17",
        endTime: "", // empty under all-day
        isAllDay: "1",
      },
    ]);
    const r = parseOneTimeEventDates(fd);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data[0].isAllDay).toBe(true);
    expect(r.data[0].endDate).not.toBeNull();
  });

  it("fails when a timed entry has no start time", () => {
    const fd = build([
      { startDate: "2026-12-31", startTime: "", hasEnd: "0", isAllDay: "0" },
    ]);
    const r = parseOneTimeEventDates(fd);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error).toMatch(/start time/i);
  });

  it("parses multiple date rows preserving per-row all-day flag", () => {
    const fd = build([
      { startDate: "2026-07-15", startTime: "", hasEnd: "0", isAllDay: "1" },
      { startDate: "2026-08-20", startTime: "18:00", hasEnd: "0", isAllDay: "0" },
    ]);
    const r = parseOneTimeEventDates(fd);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toHaveLength(2);
    expect(r.data[0].isAllDay).toBe(true);
    expect(r.data[1].isAllDay).toBe(false);
  });

  it("returns success: false with no rows", () => {
    const r = parseOneTimeEventDates(new FormData());
    expect(r.success).toBe(false);
  });
});
