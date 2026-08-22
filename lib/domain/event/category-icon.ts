import { Beer, Clapperboard, Dices, MicVocal, Plane, Puzzle, Snowflake, Tag, type LucideIcon } from "lucide-react";

import { EVENT_CATEGORIES } from "@/lib/shared/constants";

type Category = (typeof EVENT_CATEGORIES)[number];

const categoryIcons: Record<Category, LucideIcon> = {
  live: MicVocal,
  travel: Plane,
  drinking: Beer,
  nazotoki: Puzzle,
  snowboard: Snowflake,
  boardgame: Dices,
  movie_stage: Clapperboard,
  other: Tag
};

/** 未知の値(不正データ・将来の削除カテゴリ跡地)は other(Tag) 扱いにする。categoryAccent の未知値処理と揃える。 */
export function categoryIcon(category: string): LucideIcon {
  return category in categoryIcons ? categoryIcons[category as Category] : Tag;
}
