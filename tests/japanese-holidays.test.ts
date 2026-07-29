import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOLIDAY_DATA_VALID_UNTIL, isJapaneseHoliday } from "@/lib/japanese-holidays";

describe("isJapaneseHoliday", () => {
  it("recognizes a known holiday", () => {
    expect(isJapaneseHoliday("2026-01-01")).toBe(true);
  });

  it("returns false for an ordinary weekday", () => {
    expect(isJapaneseHoliday("2026-01-02")).toBe(false);
  });

  it("returns false (not a throw) for a date past the held data range", () => {
    expect(isJapaneseHoliday("2030-01-01")).toBe(false);
  });
});

describe("HOLIDAY_DATA_VALID_UNTIL", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("warns in development when a date is past the held data range", () => {
    vi.stubEnv("NODE_ENV", "development");

    isJapaneseHoliday("2030-01-01");

    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn for a date within the held data range", () => {
    vi.stubEnv("NODE_ENV", "development");

    isJapaneseHoliday(HOLIDAY_DATA_VALID_UNTIL);

    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not warn in production even when the data is stale", () => {
    vi.stubEnv("NODE_ENV", "production");

    isJapaneseHoliday("2030-01-01");

    expect(console.warn).not.toHaveBeenCalled();
  });
});
