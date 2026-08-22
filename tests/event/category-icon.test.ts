import { describe, expect, it } from "vitest";
import { Beer, Clapperboard, Dices, MicVocal, Plane, Puzzle, Snowflake, Tag } from "lucide-react";

import { categoryIcon } from "@/lib/domain/event/category-icon";

describe("categoryIcon", () => {
  it("maps every one of the 8 categories to its lucide icon component", () => {
    expect(categoryIcon("live")).toBe(MicVocal);
    expect(categoryIcon("travel")).toBe(Plane);
    expect(categoryIcon("drinking")).toBe(Beer);
    expect(categoryIcon("nazotoki")).toBe(Puzzle);
    expect(categoryIcon("snowboard")).toBe(Snowflake);
    expect(categoryIcon("boardgame")).toBe(Dices);
    expect(categoryIcon("movie_stage")).toBe(Clapperboard);
    expect(categoryIcon("other")).toBe(Tag);
  });

  it("falls back to Tag for an unknown value", () => {
    expect(categoryIcon("not-a-real-category")).toBe(Tag);
  });
});
