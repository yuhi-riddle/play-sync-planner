"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CalendarDays } from "lucide-react";

import { parseMonth, pickerYearRange } from "@/lib/domain/calendar/calendar-month";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function AdjustmentMonthPicker({ currentMonth, label }: { currentMonth: string; label: string }) {
  const router = useRouter();
  const { year: shownYear, month: shownMonthNumber } = parseMonth(currentMonth);
  const years = pickerYearRange(currentMonth, new Date());
  const [selectedYear, setSelectedYear] = useState(shownYear);

  function goToMonth(monthNumber: number) {
    const monthParam = `${selectedYear}-${String(monthNumber).padStart(2, "0")}`;
    router.push(`/plans?month=${monthParam}&date=${monthParam}-01`, { scroll: false });
  }

  return (
    <details className="group relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-base font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay sm:px-4 sm:text-xl [&::-webkit-details-marker]:hidden">
        <CalendarDays aria-hidden="true" className="h-4 w-4 text-pine sm:h-5 sm:w-5" />
        {label}
      </summary>
      <div className="absolute left-1/2 z-10 mt-2 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-control border border-line bg-cream p-3 shadow-lift">
        <div className="flex gap-3">
          {/* 年ホイール: 縦スクロール＋中央スナップ。各年は実ボタンなのでキーボードでも操作できる。 */}
          <div
            className="relative h-40 w-20 shrink-0 snap-y snap-mandatory overflow-y-auto scroll-py-16 rounded-control border border-line bg-surface [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
            aria-label="年を選ぶ"
          >
            <div className="py-16">
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setSelectedYear(year)}
                  aria-pressed={year === selectedYear}
                  className={clsx(
                    "block w-full snap-center py-2 text-center text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                    year === selectedYear ? "text-pine" : "text-muted hover:text-ink"
                  )}
                >
                  {year}年
                </button>
              ))}
            </div>
            {/* 中央の選択帯 */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-1/2 h-9 -translate-y-1/2 border-y border-pine/40"
            />
          </div>

          {/* 12ヶ月グリッド */}
          <div className="grid flex-1 grid-cols-3 gap-1.5">
            {MONTHS.map((monthNumber) => {
              const isCurrent = selectedYear === shownYear && monthNumber === shownMonthNumber;
              return (
                <button
                  key={monthNumber}
                  type="button"
                  onClick={() => goToMonth(monthNumber)}
                  className={clsx(
                    "min-h-11 rounded-control border text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                    isCurrent
                      ? "border-pine-deep bg-gradient-to-br from-pine to-pine-deep text-white"
                      : "border-line bg-surface text-ink hover:border-moss"
                  )}
                >
                  {monthNumber}月
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </details>
  );
}
