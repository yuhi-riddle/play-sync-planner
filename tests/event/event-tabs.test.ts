import { describe, expect, it } from "vitest";

import {
  EVENT_DETAIL_TABS,
  EVENT_DETAIL_TAB_LABELS,
  normalizeEventDetailTab,
  resolveEventDetailDataNeeds
} from "@/lib/domain/event/event-tabs";

describe("normalizeEventDetailTab", () => {
  it("未指定なら概要にする", () => {
    expect(normalizeEventDetailTab(undefined)).toBe("overview");
  });

  it("知らない値なら概要にする", () => {
    expect(normalizeEventDetailTab("settlement")).toBe("overview");
  });

  it("正しい値はそのまま通す", () => {
    expect(normalizeEventDetailTab("chat")).toBe("chat");
    expect(normalizeEventDetailTab("members")).toBe("members");
    expect(normalizeEventDetailTab("tasks")).toBe("tasks");
  });

  it("同じキーが複数回来たときは最初の値を見る", () => {
    expect(normalizeEventDetailTab(["tasks", "chat"])).toBe("tasks");
  });

  it("空配列なら概要にする", () => {
    expect(normalizeEventDetailTab([])).toBe("overview");
  });
});

describe("EVENT_DETAIL_TAB_LABELS", () => {
  it("すべてのタブに日本語ラベルがある", () => {
    for (const tab of EVENT_DETAIL_TABS) {
      expect(EVENT_DETAIL_TAB_LABELS[tab]).toBeTruthy();
    }
  });
});

describe("resolveEventDetailDataNeeds", () => {
  // 概要タブで重いデータを取りに行かないことが、今回の速度改善の核心。
  it("概要タブでは追加のデータを取らない", () => {
    expect(resolveEventDetailDataNeeds("overview", true)).toEqual({
      needsInviteCandidates: false,
      needsChatMessages: false,
      needsTasks: false
    });
  });

  it("チャットタブではメッセージだけ取る", () => {
    expect(resolveEventDetailDataNeeds("chat", true)).toEqual({
      needsInviteCandidates: false,
      needsChatMessages: true,
      needsTasks: false
    });
  });

  it("タスクタブではタスクだけ取る", () => {
    expect(resolveEventDetailDataNeeds("tasks", true)).toEqual({
      needsInviteCandidates: false,
      needsChatMessages: false,
      needsTasks: true
    });
  });

  it("参加者タブでは、オーナーのときだけ招待候補を取る", () => {
    expect(resolveEventDetailDataNeeds("members", true).needsInviteCandidates).toBe(true);
    expect(resolveEventDetailDataNeeds("members", false).needsInviteCandidates).toBe(false);
  });
});
