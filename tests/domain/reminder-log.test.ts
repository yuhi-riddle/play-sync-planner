import { describe, expect, it } from "vitest";

import { summarizeReminderLogs } from "@/lib/domain/reminder-log";

describe("summarizeReminderLogs", () => {
  it("returns the latest sent time and total count", () => {
    expect(
      summarizeReminderLogs([
        { sent_at: "2026-07-01T10:00:00+09:00" },
        { sent_at: "2026-07-02T10:00:00+09:00" }
      ])
    ).toEqual({
      latestSentAt: "2026-07-02T10:00:00+09:00",
      totalCount: 2
    });
  });

  it("returns an empty summary when there are no logs", () => {
    expect(summarizeReminderLogs([])).toEqual({
      latestSentAt: null,
      totalCount: 0
    });
  });
});
