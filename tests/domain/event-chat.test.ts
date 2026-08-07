import { describe, expect, it } from "vitest";

import { normalizeEventMessageBody } from "@/lib/domain/event/event-chat";

describe("normalizeEventMessageBody", () => {
  it("trims a message before returning it", () => {
    expect(normalizeEventMessageBody("  今日は18時でいい？  ")).toBe("今日は18時でいい？");
  });

  it("rejects an empty message", () => {
    expect(() => normalizeEventMessageBody("   ")).toThrow("メッセージを入力してください");
  });

  it("rejects messages longer than 2,000 characters", () => {
    expect(() => normalizeEventMessageBody("a".repeat(2001))).toThrow("2,000文字以内");
  });
});
