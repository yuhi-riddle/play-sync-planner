import { describe, expect, it } from "vitest";

import { maxSessionWindowValue, type LayoutShiftSample } from "@/lib/domain/cls";

function sample(value: number, startTime: number, hadRecentInput = false): LayoutShiftSample {
  return { value, startTime, hadRecentInput };
}

describe("maxSessionWindowValue", () => {
  it("returns 0 for an empty array", () => {
    expect(maxSessionWindowValue([])).toBe(0);
  });

  it("sums samples within a single session", () => {
    const samples = [sample(0.1, 0), sample(0.2, 200), sample(0.05, 900)];
    expect(maxSessionWindowValue(samples)).toBeCloseTo(0.35);
  });

  it("excludes samples with hadRecentInput: true", () => {
    const samples = [sample(0.1, 0), sample(0.9, 300, true), sample(0.2, 600)];
    expect(maxSessionWindowValue(samples)).toBeCloseTo(0.3);
  });

  it("starts a new session when the gap since the previous sample exceeds 1000ms", () => {
    const samples = [sample(0.1, 0), sample(0.2, 500), sample(0.5, 1600)];
    // セッション1: 0 + 500 → 0.1 + 0.2 = 0.3
    // セッション2: 1600 (前のサンプルから1100ms超) → 0.5
    expect(maxSessionWindowValue(samples)).toBeCloseTo(0.5);
  });

  it("starts a new session when the total window since session start exceeds 5000ms", () => {
    const samples = [
      sample(0.1, 0),
      sample(0.1, 900),
      sample(0.1, 1800),
      sample(0.1, 2700),
      sample(0.1, 3600),
      sample(0.1, 4500),
      // ここまでは前サンプルから900ms以内だが、セッション先頭(0)から5400msで5000ms超のため新セッション
      sample(0.3, 5400)
    ];
    // セッション1合計: 0.1 * 6 = 0.6（先頭からの累積が5000msを超える直前まで）
    // セッション2: 0.3
    expect(maxSessionWindowValue(samples)).toBeCloseTo(0.6);
  });

  it("returns the value of the largest session when multiple sessions exist", () => {
    const samples = [
      sample(0.05, 0),
      sample(0.05, 200),
      // gap > 1000ms → 新セッション
      sample(0.9, 2000),
      sample(0.4, 2300)
    ];
    // セッション1: 0.1、セッション2: 1.3 → 最大値は1.3
    expect(maxSessionWindowValue(samples)).toBeCloseTo(1.3);
  });
});
