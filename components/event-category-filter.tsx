"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { MadoiSelect } from "@/components/ui";
import { categoryLabels, EVENT_CATEGORIES } from "@/lib/constants";
import { eventFilterHref, type EventCategoryFilter as CategoryValue } from "@/lib/event-filter";

const options = [
  { value: "all", label: "すべて" },
  ...EVENT_CATEGORIES.map((category) => ({ value: category, label: categoryLabels[category] }))
];

function FilterChip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-body font-bold text-white shadow-soft focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          : "inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      }
    >
      {children}
    </Link>
  );
}

/**
 * カテゴリは9件あり、スマホだとチップが4行に折り返して画面の大半を絞り込みが占めてしまう。
 * 狭い画面ではドロップダウン、広い画面では一覧性のあるチップ、と出し分ける。
 */
export function EventCategoryFilter({ activeCategory }: { activeCategory: CategoryValue }) {
  const router = useRouter();

  return (
    <div>
      <p className="mb-2 text-eyebrow uppercase text-pine">カテゴリ</p>

      <div className="sm:hidden">
        <MadoiSelect
          fieldLabel="カテゴリ"
          ariaLabel="カテゴリで絞り込む"
          value={activeCategory}
          options={options}
          onValueChange={(value) => router.push(eventFilterHref(value as CategoryValue))}
        />
      </div>

      <div className="hidden flex-wrap gap-2 sm:flex">
        {options.map((option) => (
          <FilterChip
            key={option.value}
            href={eventFilterHref(option.value as CategoryValue)}
            active={activeCategory === option.value}
          >
            {option.label}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}
