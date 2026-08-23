import { describe, expect, it } from "vitest";

import { categoryAccent } from "@/lib/domain/event/category-color";

describe("categoryAccent", () => {
  it("returns the matching accent classes for a known category", () => {
    expect(categoryAccent("nazotoki")).toEqual({
      bar: "border-l-category-nazotoki",
      badgeBg: "bg-category-nazotoki/16",
      badgeText: "text-category-nazotoki-ink",
      dot: "bg-category-nazotoki",
      fieldBorder: "border-category-nazotoki"
    });
  });

  it("returns distinct accent classes for every one of the 8 categories", () => {
    const categories = ["live", "travel", "drinking", "nazotoki", "snowboard", "boardgame", "movie_stage", "other"];
    const results = categories.map((category) => categoryAccent(category).dot);
    expect(new Set(results).size).toBe(categories.length);
  });

  it("falls back to the other/neutral accent for an unknown value", () => {
    expect(categoryAccent("not-a-real-category")).toEqual({
      bar: "border-l-line-strong",
      badgeBg: "bg-sunken",
      badgeText: "text-muted",
      dot: "bg-subtle",
      fieldBorder: "border-line-strong"
    });
  });

  it("uses the same neutral accent for the other category explicitly", () => {
    expect(categoryAccent("other")).toEqual(categoryAccent("not-a-real-category"));
  });
});
