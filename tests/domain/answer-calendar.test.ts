import { describe, expect, it } from "vitest";

import { buildCandidateCalendarHints, monthsForCandidates } from "@/lib/domain/answer-calendar";

const candidates = [
  {
    id: "date-1",
    start_at: "2026-07-01T10:00:00+09:00",
    end_at: "2026-07-01T12:00:00+09:00"
  },
  {
    id: "date-2",
    start_at: "2026-08-02T13:00:00+09:00",
    end_at: "2026-08-02T15:00:00+09:00"
  }
];

describe("answer calendar helpers", () => {
  it("collects unique months from candidate dates", () => {
    expect(monthsForCandidates([...candidates, { ...candidates[0], id: "date-3" }])).toEqual(["2026-07", "2026-08"]);
  });

  it("returns conflicting Google Calendar events for each candidate", () => {
    const hints = buildCandidateCalendarHints({
      candidates,
      busyRanges: [
        {
          start: "2026-07-01T11:00:00+09:00",
          end: "2026-07-01T11:30:00+09:00",
          title: "歯医者",
          location: "新宿"
        },
        {
          start: "2026-07-01T12:00:00+09:00",
          end: "2026-07-01T13:00:00+09:00",
          title: "重ならない予定",
          location: null
        }
      ]
    });

    expect(hints["date-1"]?.hasConflict).toBe(true);
    expect(hints["date-1"]?.events).toEqual([
      expect.objectContaining({
        title: "歯医者",
        location: "新宿"
      })
    ]);
    expect(hints["date-2"]?.hasConflict).toBe(false);
  });
});
