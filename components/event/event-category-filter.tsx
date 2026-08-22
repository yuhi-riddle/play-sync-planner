"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import type { ReactNode } from "react";
import { clsx } from "clsx";

import { categoryLabels, EVENT_CATEGORIES } from "@/lib/shared/constants";
import { categoryAccent } from "@/lib/domain/event/category-color";
import {
  eventFilterHref,
  type EventCategoryCounts,
  type EventCategoryFilter as CategoryValue
} from "@/lib/domain/event/event-filter";

function FilterChip({
  href,
  active,
  dotClassName,
  children
}: {
  href: string;
  active: boolean;
  dotClassName?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-pine to-pine-deep px-4 py-2 text-body font-bold text-white shadow-soft focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          : "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      }
    >
      {dotClassName ? (
        <span aria-hidden="true" className={clsx("h-1.5 w-1.5 shrink-0 rounded-full ring-2 ring-white/70", dotClassName)} />
      ) : null}
      {children}
    </Link>
  );
}

export function EventCategoryFilter({
  activeCategory,
  categoryCounts
}: {
  activeCategory: CategoryValue;
  categoryCounts: EventCategoryCounts;
}) {
  const router = useRouter();
  const options = [
    { value: "all" as const, label: "すべて" },
    ...EVENT_CATEGORIES.filter((category) => categoryCounts[category] > 0).map((category) => ({
      value: category,
      label: categoryLabels[category]
    }))
  ];

  return (
    <div>
      <p className="mb-2 text-eyebrow uppercase text-pine">カテゴリ</p>
      <div className="sm:hidden">
        <select
          aria-label="カテゴリで絞り込む"
          value={activeCategory}
          onChange={(event) => router.push(eventFilterHref(event.target.value as CategoryValue))}
          className="min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base font-medium text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="hidden flex-wrap gap-2 sm:flex">
        {options.map((option) => (
          <FilterChip
            key={option.value}
            href={eventFilterHref(option.value)}
            active={activeCategory === option.value}
            dotClassName={option.value === "all" ? undefined : categoryAccent(option.value).dot}
          >
            {option.label}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}
