"use client";

import React from "react";

export function EventWrapupActions({
  completeAction,
  snoozeAction
}: {
  completeAction: (formData: FormData) => void | Promise<void>;
  snoozeAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="mt-4 rounded-control border-t border-dashed border-line-strong bg-sunken px-4 pt-3 pb-3.5">
      <p className="text-sm font-bold text-ink">
        開催おつかれさまでした。<span className="font-normal text-muted">このイベント、締めていい？</span>
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <form action={completeAction}>
          <button
            type="submit"
            className="inline-flex min-h-9 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-4 py-1.5 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            完了にする
          </button>
        </form>
        <form action={snoozeAction}>
          <button
            type="submit"
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-bold text-muted focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            後で
          </button>
        </form>
      </div>
    </div>
  );
}
