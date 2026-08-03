import { describe, expect, it } from "vitest";

import { canStartDateAdjustment, isTerminalEventStatus } from "@/lib/domain/event-adjustment";

describe("canStartDateAdjustment", () => {
  it("招待を締め切っていれば日程調整へ進める", () => {
    expect(canStartDateAdjustment("planning", "closed")).toBe(true);
  });

  it("招待がまだ開いていれば進めない", () => {
    expect(canStartDateAdjustment("planning", "open")).toBe(false);
  });

  it("招待が無ければ進めない", () => {
    expect(canStartDateAdjustment("planning", null)).toBe(false);
    expect(canStartDateAdjustment("planning", undefined)).toBe(false);
  });

  it("中止したイベントでは、招待を締め切っていても進めない", () => {
    expect(canStartDateAdjustment("cancelled", "closed")).toBe(false);
  });

  it("完了したイベントでは、招待を締め切っていても進めない", () => {
    expect(canStartDateAdjustment("done", "closed")).toBe(false);
  });

  it("見送ったイベントでは、招待を締め切っていても進めない", () => {
    expect(canStartDateAdjustment("skipped", "closed")).toBe(false);
  });

  it("終了状態ではないイベント（confirmed）なら、招待を締め切っていれば進める", () => {
    expect(canStartDateAdjustment("confirmed", "closed")).toBe(true);
  });
});

describe("isTerminalEventStatus", () => {
  it("interested は終了状態ではない", () => {
    expect(isTerminalEventStatus("interested")).toBe(false);
  });

  it("planning は終了状態ではない", () => {
    expect(isTerminalEventStatus("planning")).toBe(false);
  });

  it("confirmed は終了状態ではない", () => {
    expect(isTerminalEventStatus("confirmed")).toBe(false);
  });

  it("done は終了状態", () => {
    expect(isTerminalEventStatus("done")).toBe(true);
  });

  it("cancelled は終了状態", () => {
    expect(isTerminalEventStatus("cancelled")).toBe(true);
  });

  it("skipped は終了状態", () => {
    expect(isTerminalEventStatus("skipped")).toBe(true);
  });
});
