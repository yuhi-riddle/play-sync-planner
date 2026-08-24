import { EVENT_CATEGORIES } from "@/lib/shared/constants";

export type CategoryAccentClasses = {
  bar: string;
  badgeBg: string;
  badgeText: string;
  dot: string;
  fieldBorder: string;
};

type Category = (typeof EVENT_CATEGORIES)[number];

const otherAccent: CategoryAccentClasses = {
  bar: "border-l-line-strong",
  badgeBg: "bg-sunken",
  badgeText: "text-muted",
  dot: "bg-subtle",
  fieldBorder: "border-line-strong"
};

const categoryAccents: Record<Category, CategoryAccentClasses> = {
  live: {
    bar: "border-l-category-live",
    badgeBg: "bg-category-live/16",
    badgeText: "text-category-live-ink",
    dot: "bg-category-live",
    fieldBorder: "border-category-live"
  },
  travel: {
    bar: "border-l-category-travel",
    badgeBg: "bg-category-travel/16",
    badgeText: "text-category-travel-ink",
    dot: "bg-category-travel",
    fieldBorder: "border-category-travel"
  },
  drinking: {
    bar: "border-l-category-drinking",
    badgeBg: "bg-category-drinking/16",
    badgeText: "text-category-drinking-ink",
    dot: "bg-category-drinking",
    fieldBorder: "border-category-drinking"
  },
  nazotoki: {
    bar: "border-l-category-nazotoki",
    badgeBg: "bg-category-nazotoki/16",
    badgeText: "text-category-nazotoki-ink",
    dot: "bg-category-nazotoki",
    fieldBorder: "border-category-nazotoki"
  },
  snowboard: {
    bar: "border-l-category-snowboard",
    badgeBg: "bg-category-snowboard/16",
    badgeText: "text-category-snowboard-ink",
    dot: "bg-category-snowboard",
    fieldBorder: "border-category-snowboard"
  },
  boardgame: {
    bar: "border-l-category-boardgame",
    badgeBg: "bg-category-boardgame/16",
    badgeText: "text-category-boardgame-ink",
    dot: "bg-category-boardgame",
    fieldBorder: "border-category-boardgame"
  },
  movie_stage: {
    bar: "border-l-category-movie-stage",
    badgeBg: "bg-category-movie-stage/16",
    badgeText: "text-category-movie-stage-ink",
    dot: "bg-category-movie-stage",
    fieldBorder: "border-category-movie-stage"
  },
  other: otherAccent
};

/** 未知の値(不正データ・将来の削除カテゴリ跡地)は other 扱いにする。 */
export function categoryAccent(category: string): CategoryAccentClasses {
  return category in categoryAccents ? categoryAccents[category as Category] : otherAccent;
}
