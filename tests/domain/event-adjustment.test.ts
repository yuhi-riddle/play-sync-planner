import { describe, expect, it } from "vitest";

import { canStartDateAdjustment } from "@/lib/domain/event-adjustment";

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
});
