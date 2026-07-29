import { describe, expect, it } from "vitest";

import { googleItemsFromResponse } from "@/lib/google-calendar/free-busy-items";

describe("googleItemsFromResponse", () => {
  it("returns nothing when Google Calendar isn't connected", () => {
    expect(googleItemsFromResponse({ connected: false, busy: [] })).toEqual([]);
  });

  it("maps busy ranges into home calendar items", () => {
    const items = googleItemsFromResponse({
      connected: true,
      busy: [{ start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T11:00:00+09:00", title: "歯医者", location: "新宿" }]
    });

    expect(items).toEqual([
      {
        id: "google-2026-07-15T10:00:00+09:00-0",
        kind: "google",
        title: "歯医者",
        location: "新宿",
        startAt: "2026-07-15T10:00:00+09:00",
        endAt: "2026-07-15T11:00:00+09:00"
      }
    ]);
  });

  it("falls back to a generic title when Google doesn't provide one", () => {
    const items = googleItemsFromResponse({
      connected: true,
      busy: [{ start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T11:00:00+09:00", title: null, location: null }]
    });

    expect(items[0].title).toBe("予定あり");
  });
});
