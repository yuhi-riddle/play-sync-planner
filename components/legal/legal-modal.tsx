"use client";

import Link from "next/link";
import React, { useEffect, useId, useRef } from "react";

import { LegalDocumentBody } from "@/components/legal/legal-document-body";
import { LEGAL_EFFECTIVE_DATE, type LegalSection } from "@/lib/domain/account/legal-documents";

export function LegalModal({
  title,
  sections,
  pageHref,
  onClose
}: {
  title: string;
  sections: LegalSection[];
  pageHref: string;
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
        <div>
          <h2 id={titleId} className="text-xl font-bold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-7 text-muted">施行日: {LEGAL_EFFECTIVE_DATE}</p>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          <LegalDocumentBody sections={sections} headingLevel="h3" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Link
            href={pageHref}
            className="inline-flex min-h-11 items-center font-bold text-pine underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            ページで開く
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            閉じる
          </button>
        </div>
      </section>
    </div>
  );
}
