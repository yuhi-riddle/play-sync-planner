import { describe, expect, it } from "vitest";

import { EVENT_CATEGORIES } from "@/lib/shared/constants";

describe("EVENT_CATEGORIES", () => {
  it("keeps nazotoki near the middle instead of first", () => {
    expect(EVENT_CATEGORIES[0]).not.toBe("nazotoki");
    expect(EVENT_CATEGORIES.indexOf("nazotoki")).toBeGreaterThanOrEqual(3);
    expect(EVENT_CATEGORIES.indexOf("nazotoki")).toBeLessThanOrEqual(4);
  });
});
