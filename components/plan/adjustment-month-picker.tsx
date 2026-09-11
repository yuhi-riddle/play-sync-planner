"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CalendarDays } from "lucide-react";

import { parseMonth, pickerYearRange } from "@/lib/domain/calendar/calendar-month";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function AdjustmentMonthPicker({
  currentMonth,
  currentYear,
  label
}: {
  currentMonth: string;
  /** サーバーで確定した「今年」。年ホイールの範囲に使う（render 中に new Date() を読まない）。 */
  currentYear: number;
  label: string;
}) {
  const router = useRouter();
  const { year: shownYear, month: shownMonthNumber } = parseMonth(currentMonth);
  const years = pickerYearRange(currentMonth, currentYear);
  const [selectedYear, setSelectedYear] = useState(shownYear);

  const detailsRef = useRef<HTMLDetailsElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const yearButtonRefs = useRef(new Map<number, HTMLButtonElement>());

  // 中央に一番近い年を選択年にする。スクロール中に何度も走るので軽く。
  const syncYearFromScroll = useCallback(() => {
    const wheel = wheelRef.current;
    if (!wheel) {
      return;
    }
    const center = wheel.scrollTop + wheel.clientHeight / 2;
    let nearestYear = years[0];
    let nearestGap = Number.POSITIVE_INFINITY;
    for (const year of years) {
      const button = yearButtonRefs.current.get(year);
      if (!button) {
        continue;
      }
      const buttonCenter = button.offsetTop + button.offsetHeight / 2;
      const gap = Math.abs(buttonCenter - center);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearestYear = year;
      }
    }
    setSelectedYear(nearestYear);
  }, [years]);

  // パネルを開いたときと currentMonth が変わったとき、表示中の年を中央へ。
  // jsdom には scrollIntoView が無いのでメソッドの有無もガードする。
  function scrollYearToCenter(year: number, behavior: ScrollBehavior) {
    const button = yearButtonRefs.current.get(year);
    button?.scrollIntoView?.({ block: "center", behavior });
  }

  useEffect(() => {
    setSelectedYear(shownYear);
    scrollYearToCenter(shownYear, "auto");
  }, [shownYear]);

  function goToMonth(monthNumber: number) {
    const monthParam = `${selectedYear}-${String(monthNumber).padStart(2, "0")}`;
    detailsRef.current?.removeAttribute("open");
    router.push(`/plans?month=${monthParam}&date=${monthParam}-01`, { scroll: false });
  }

  return (
    <details
      ref={detailsRef}
      className="group relative"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) {
          // パネルが可視になった直後はレイアウト未確定。次フレームで中央へ寄せる。
          requestAnimationFrame(() => scrollYearToCenter(selectedYear, "auto"));
        }
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-base font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay sm:px-4 sm:text-xl [&::-webkit-details-marker]:hidden">
        <CalendarDays aria-hidden="true" className="h-4 w-4 text-pine sm:h-5 sm:w-5" />
        {label}
      </summary>
      <div className="absolute left-1/2 z-10 mt-2 w-[min(19rem,calc(100vw-2rem))] -translate-x-1/2 rounded-control border border-line bg-cream p-3 shadow-lift">
        <div className="flex gap-2">
          {/* 年ホイール: 縦スクロール＋中央スナップ。スクロール位置で選択年が変わる。
              中央に淡い帯、上下にフェードでホイールらしく見せる。 */}
          <div className="relative shrink-0">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-9 -translate-y-1/2 rounded-control bg-pine/[0.07]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 rounded-t-control bg-gradient-to-b from-cream to-transparent"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 rounded-b-control bg-gradient-to-t from-cream to-transparent"
            />
            <div
              ref={wheelRef}
              onScroll={syncYearFromScroll}
              className="h-36 w-[4.25rem] snap-y snap-mandatory overflow-y-auto scroll-py-[3.75rem] rounded-control border border-line bg-surface [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
              aria-label="年を選ぶ"
            >
              <div className="py-[3.75rem]">
                {years.map((year) => (
                  <button
                    key={year}
                    ref={(node) => {
                      if (node) {
                        yearButtonRefs.current.set(year, node);
                      } else {
                        yearButtonRefs.current.delete(year);
                      }
                    }}
                    type="button"
                    onClick={() => {
                      setSelectedYear(year);
                      scrollYearToCenter(year, "smooth");
                    }}
                    aria-pressed={year === selectedYear}
                    className={clsx(
                      "block w-full snap-center py-2 text-center text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                      year === selectedYear ? "text-pine" : "text-subtle hover:text-ink"
                    )}
                  >
                    {year}年
                  </button>
                ))}
              </div>
            </div>
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
