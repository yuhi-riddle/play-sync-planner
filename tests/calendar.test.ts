import { describe, expect, it } from "vitest";

import { buildMonthCalendar, formatDateForInput, toDateTimeLocalValueFromParts } from "@/lib/calendar";

describe("calendar helpers", () => {
  it("builds a six-week month grid starting on Sunday", () => {
    const cells = buildMonthCalendar(2026, 6);

    expect(cells).toHaveLength(42);
    expect(cells[0]).toMatchObject({
      date: "2026-06-28",
      day: 28,
      isCurrentMonth: false
    });
    expect(cells[3]).toMatchObject({
      date: "2026-07-01",
      day: 1,
      isCurrentMonth: true
    });
  });

  it("formats dates without timezone shifts", () => {
    expect(formatDateForInput(new Date(2026, 6, 1))).toBe("2026-07-01");
  });

  it("combines selected date and time into datetime-local value", () => {
    expect(toDateTimeLocalValueFromParts("2026-07-01", "19:15")).toBe("2026-07-01T19:15");
  });
});
