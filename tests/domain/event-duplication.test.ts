import { describe, expect, it } from "vitest";

import { buildDuplicatedEvent, duplicatedEventTitle } from "@/lib/domain/event-duplication";

describe("duplicatedEventTitle", () => {
  it("コピーであることが分かる名前にする", () => {
    expect(duplicatedEventTitle("川遊び")).toBe("川遊び（コピー）");
  });

  it("何度複製しても「（コピー）」を重ねない", () => {
    expect(duplicatedEventTitle("川遊び（コピー）")).toBe("川遊び（コピー）");
  });

  it("タイトルが無いときは既定の名前にする", () => {
    expect(duplicatedEventTitle(null)).toBe("新しいイベント（コピー）");
    expect(duplicatedEventTitle("   ")).toBe("新しいイベント（コピー）");
  });
});

describe("buildDuplicatedEvent", () => {
  const source = {
    category: "outdoor",
    title: "川遊び",
    url: "https://example.com",
    location_name: "多摩川",
    address: "東京都",
    memo: "浮き輪を持っていく",
    start_date: "2026-08-01",
    end_date: "2026-08-02",
    status: "confirmed",
    price: 3000,
    capacity: 8
  };

  it("場所とメモは引き継ぐ", () => {
    const duplicated = buildDuplicatedEvent(source, "user-1");

    expect(duplicated).toMatchObject({
      category: "outdoor",
      title: "川遊び（コピー）",
      url: "https://example.com",
      location_name: "多摩川",
      address: "東京都",
      memo: "浮き輪を持っていく",
      owner_user_id: "user-1"
    });
  });

  it("日付と進行状態は引き継がない", () => {
    const duplicated = buildDuplicatedEvent(source, "user-1");

    expect(duplicated.start_date).toBeNull();
    expect(duplicated.end_date).toBeNull();
    expect(duplicated.status).toBe("interested");
  });

  it("金額と定員も引き継がない", () => {
    const duplicated = buildDuplicatedEvent(source, "user-1");

    expect(duplicated.price).toBeNull();
    expect(duplicated.capacity).toBeNull();
  });
});
