"use client";

import React from "react";

export function EventReopenAction({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form action={action} className="mt-4 rounded-control border border-line bg-sunken p-4">
      <p className="text-sm text-muted">
        このイベントは1ヶ月以上動きがなかったため自動で完了になりました。
      </p>
      <button
        type="submit"
        className="mt-2 inline-flex min-h-9 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-bold text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      >
        完了を取り消す
      </button>
    </form>
  );
}
