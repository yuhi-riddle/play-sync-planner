import { describe, expect, it } from "vitest";

import { pickNextUpcoming } from "@/lib/domain/home/next-upcoming";
import type { HomeCalendarItem } from "@/lib/domain/home/home-calendar";

const now = new Date("2026-09-02T09:00:00+09:00");

function item(overrides: Partial<HomeCalendarItem> & Pick<HomeCalendarItem, "id" | "kind" | "startAt">): HomeCalendarItem {
  return { title: "会", ...overrides };
}

describe("pickNextUpcoming", () => {
  it("何も無ければ null", () => {
    expect(pickNextUpcoming([], now)).toBeNull();
  });

  it("すべて過去なら null", () => {
    const items = [
      item({ id: "c1", kind: "confirmed", startAt: "2026-09-01T20:00:00+09:00" }),
      item({ id: "a1", kind: "collecting", startAt: "2026-08-30T20:00:00+09:00" })
    ];
    expect(pickNextUpcoming(items, now)).toBeNull();
  });

  it("今日以降の確定があれば、調整中がもっと早くても確定を返す", () => {
    const items = [
      item({ id: "a1", kind: "collecting", startAt: "2026-09-03T19:00:00+09:00" }),
      item({ id: "c1", kind: "confirmed", startAt: "2026-09-20T13:00:00+09:00" })
    ];
    expect(pickNextUpcoming(items, now)?.id).toBe("c1");
  });

  it("確定が複数なら最も早いもの", () => {
    const items = [
      item({ id: "c-late", kind: "confirmed", startAt: "2026-10-01T13:00:00+09:00" }),
      item({ id: "c-soon", kind: "confirmed", startAt: "2026-09-10T13:00:00+09:00" })
    ];
    expect(pickNextUpcoming(items, now)?.id).toBe("c-soon");
  });

  it("確定が無ければ調整中の最も早いもの（何ヶ月先でも）", () => {
    const items = [
      item({ id: "a-late", kind: "collecting", startAt: "2026-12-01T19:00:00+09:00" }),
      item({ id: "a-soon", kind: "collecting", startAt: "2026-11-15T19:00:00+09:00" })
    ];
    expect(pickNextUpcoming(items, now)?.id).toBe("a-soon");
  });

  it("google は無視する", () => {
    const items = [
      item({ id: "g1", kind: "google", startAt: "2026-09-02T10:00:00+09:00" }),
      item({ id: "a1", kind: "collecting", startAt: "2026-09-05T19:00:00+09:00" })
    ];
    expect(pickNextUpcoming(items, now)?.id).toBe("a1");
  });

  it("今日ちょうど始まる項目は対象に含む", () => {
    const items = [item({ id: "c1", kind: "confirmed", startAt: "2026-09-02T08:00:00+09:00" })];
    expect(pickNextUpcoming(items, now)?.id).toBe("c1");
  });
});
