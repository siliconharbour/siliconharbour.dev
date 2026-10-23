import { describe, expect, it } from "vitest";
import { eventFormInput } from "~/lib/admin/event-form-adapter";
import { eventCreateInput } from "~/operations/contracts/events";

function build(rows: Array<Record<string, string>>): FormData {
  const fd = new FormData();
  fd.set("title", "Meetup");
  fd.set("description", "Description");
  fd.set("link", "https://example.com");
  rows.forEach((row, i) => {
    for (const [k, v] of Object.entries(row)) {
      fd.set(`dates[${i}][${k}]`, v);
    }
  });
  return fd;
}

function parse(form: FormData) {
  return eventCreateInput.parse(eventFormInput(form, false)).dates!;
}

describe("event form dates", () => {
  it("parses a timed event with start time only", () => {
    const fd = build([{ startDate: "2026-12-31", startTime: "18:00", hasEnd: "0", isAllDay: "0" }]);
    const r = parse(fd);
    expect(r).toHaveLength(1);
    expect(r[0].isAllDay).toBe(false);
    expect(r[0].endDate).toBeUndefined();
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
    const r = parse(fd);
    expect(r[0].endDate).toBe("2026-12-31");
    expect(r[0].endTime).toBe("21:00");
    expect(r[0].isAllDay).toBe(false);
  });

  it("parses an all-day event and ignores the time inputs", () => {
    const fd = build([
      {
        startDate: "2026-07-15",
        startTime: "",
        hasEnd: "0",
        isAllDay: "1",
      },
    ]);
    const r = parse(fd);
    expect(r[0].isAllDay).toBe(true);
    expect(r[0].endDate).toBeUndefined();
  });

  it("parses a multi-day all-day event using only the end date", () => {
    const fd = build([
      {
        startDate: "2026-07-15",
        startTime: "",
        hasEnd: "1",
        endDate: "2026-07-17",
        endTime: "",
        isAllDay: "1",
      },
    ]);
    const r = parse(fd);
    expect(r[0].isAllDay).toBe(true);
    expect(r[0].endDate).toBe("2026-07-17");
    expect(r[0].endTime).toBeUndefined();
  });

  it("fails when a timed entry has no start time", () => {
    const fd = build([{ startDate: "2026-12-31", startTime: "", hasEnd: "0", isAllDay: "0" }]);
    expect(() => parse(fd)).toThrow(/startTime/);
  });

  it("parses multiple date rows preserving per-row all-day flag", () => {
    const fd = build([
      { startDate: "2026-07-15", startTime: "", hasEnd: "0", isAllDay: "1" },
      { startDate: "2026-08-20", startTime: "18:00", hasEnd: "0", isAllDay: "0" },
    ]);
    const r = parse(fd);
    expect(r).toHaveLength(2);
    expect(r[0].isAllDay).toBe(true);
    expect(r[1].isAllDay).toBe(false);
  });

  it("returns success: false with no rows", () => {
    expect(() => parse(build([]))).toThrow(/dates/);
  });
});
