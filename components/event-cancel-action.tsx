"use client";

import React, { useState } from "react";

export function EventCancelAction({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="mt-5 rounded-control border border-clay/25 bg-clay/10 p-4" aria-live="polite">
        <p className="text-sm font-bold text-ink">イベントを中止しますか？</p>
        <p className="mt-1 text-sm leading-6 text-muted">参加受付と進行中の日程調整も停止します。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={action}>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full bg-clay px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2">
              中止する
            </button>
          </form>
          <button type="button" onClick={() => setConfirming(false)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2">
            戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-clay/30 bg-surface px-4 py-2 text-sm font-bold text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2">
      イベントを中止
    </button>
  );
}
