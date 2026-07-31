import { describe, expect, it } from "vitest";

import { resolveEventProgress } from "@/lib/domain/event-progress";

describe("resolveEventProgress", () => {
  it("日程調整がなければ参加者募集中", () => {
    expect(resolveEventProgress("open", [])).toEqual({
      statusLabel: "参加者募集中",
      highlightLabel: null,
      highlightAt: null
    });
  });

  it("日程調整があれば日程調整中になり、回答期限を出す", () => {
    const progress = resolveEventProgress("open", [
      { status: "open", confirmed_start_at: null, answer_deadline_at: "2026-07-20T03:00:00Z" }
    ]);

    expect(progress.statusLabel).toBe("日程調整中");
    expect(progress.highlightLabel).toBe("回答期限");
    expect(progress.highlightAt).toBe("2026-07-20T03:00:00Z");
  });

  it("確定していれば確定になり、開催日時を出す", () => {
    const progress = resolveEventProgress("confirmed", [
      { status: "confirmed", confirmed_start_at: "2026-07-25T09:00:00Z", answer_deadline_at: "2026-07-20T03:00:00Z" }
    ]);

    expect(progress.statusLabel).toBe("確定");
    expect(progress.highlightLabel).toBe("開催日時");
    expect(progress.highlightAt).toBe("2026-07-25T09:00:00Z");
  });

  it("日程調整が複数あるときは、確定済みの開催日時を優先する", () => {
    const progress = resolveEventProgress("confirmed", [
      { status: "open", confirmed_start_at: null, answer_deadline_at: "2026-07-18T03:00:00Z" },
      { status: "confirmed", confirmed_start_at: "2026-07-25T09:00:00Z", answer_deadline_at: "2026-07-20T03:00:00Z" }
    ]);

    expect(progress.highlightLabel).toBe("開催日時");
    expect(progress.highlightAt).toBe("2026-07-25T09:00:00Z");
  });

  it("確定がなければ、回答期限が最も早いものを出す", () => {
    const progress = resolveEventProgress("open", [
      { status: "open", confirmed_start_at: null, answer_deadline_at: "2026-07-22T03:00:00Z" },
      { status: "open", confirmed_start_at: null, answer_deadline_at: "2026-07-18T03:00:00Z" }
    ]);

    expect(progress.highlightAt).toBe("2026-07-18T03:00:00Z");
  });

  it("確定も回答期限もなければ日時を出さない", () => {
    const progress = resolveEventProgress("open", [
      { status: "open", confirmed_start_at: null, answer_deadline_at: null }
    ]);

    expect(progress.statusLabel).toBe("日程調整中");
    expect(progress.highlightLabel).toBeNull();
    expect(progress.highlightAt).toBeNull();
  });
});
