"use client";

import React from "react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

export function AdjustmentMonthPicker({ currentMonth, label }: { currentMonth: string; label: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(currentMonth);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return;
    }

    router.push(`/plans?month=${month}&date=${month}-01`, { scroll: false });
  }

  return (
    <details className="group relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-base font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay sm:px-4 sm:text-xl [&::-webkit-details-marker]:hidden">
        <CalendarDays aria-hidden="true" className="h-4 w-4 text-pine sm:h-5 sm:w-5" />
        {label}
      </summary>
      <form
        onSubmit={handleSubmit}
        className="absolute left-1/2 z-10 mt-2 w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-control border border-line bg-cream p-3 shadow-lift"
      >
        <label className="block text-sm font-bold text-muted">
          表示する月
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.currentTarget.value)}
            className="mt-2 min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-base text-ink outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
        </label>
        <button
          type="submit"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-4 py-2 text-sm font-bold text-white transition-colors hover:from-pine-deep hover:to-pine-deep focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          この月を見る
        </button>
      </form>
    </details>
  );
}
