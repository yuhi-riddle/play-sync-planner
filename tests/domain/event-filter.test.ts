import { describe, expect, it } from "vitest";

import { countEventsByCategory, resolveEventCategoryFilter } from "@/lib/event-filter";

describe("event category filtering", () => {
  it("counts events by category", () => {
    expect(
      countEventsByCategory([
        { category: "live" },
        { category: "live" },
        { category: "travel" }
      ])
    ).toMatchObject({
      all: 3,
      live: 2,
      travel: 1,
      nazotoki: 0
    });
  });

  it("falls back to all when the requested category has no events", () => {
    const counts = countEventsByCategory([{ category: "live" }]);

    expect(resolveEventCategoryFilter("nazotoki", counts)).toBe("all");
    expect(resolveEventCategoryFilter("live", counts)).toBe("live");
  });
});
