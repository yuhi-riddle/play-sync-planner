"use client";

import Link from "next/link";
import React, { useEffect, useId, useRef } from "react";

import { eventDisplayStateLabels } from "@/lib/domain/event/event-filter";
import type { ActiveSharedEvent } from "@/lib/domain/account/connections";

export function ActiveSharedEventsModal({
  displayName,
  events,
  onClose
}: {
  displayName: string;
  events: ActiveSharedEvent[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      // 背景へ抜けないように、モーダル内の操作できる要素の間だけを行き来させる。
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button");
      if (!focusable || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/42 px-4 py-8 backdrop-blur-sm">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-control border border-line bg-cream p-5 shadow-soft"
      >
        <h2 id={titleId} className="text-xl font-bold text-ink">
          {displayName}さんとの進行中のイベント
        </h2>

        <div className="mt-4 flex-1 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-sm text-muted">進行中の共通イベントはありません。</p>
          ) : (
            <ul className="grid gap-2">
              {events.map((event) => (
                <li key={event.eventId}>
                  <Link
                    href={`/events/${event.eventId}`}
                    className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-3 transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
                  >
                    <span className="font-bold text-ink">{event.title}</span>
                    <span className="whitespace-nowrap text-sm text-muted">
                      {eventDisplayStateLabels[event.displayState]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex justify-end border-t border-line pt-4">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-6 py-2 text-body font-bold text-white shadow-soft transition-colors hover:from-pine-deep hover:to-pine-deep focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            閉じる
          </button>
        </div>
      </section>
    </div>
  );
}
