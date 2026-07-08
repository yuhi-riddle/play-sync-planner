"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-white/70 bg-cream/72 p-5 shadow-soft backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-moss">Madoi</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-ink sm:text-4xl">うまく表示できませんでした</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/68">
          一時的な通信エラーか、ページの読み込みに失敗した可能性があります。もう一度試すか、ホームに戻ってください。
        </p>
      </section>

      <section className="rounded-lg border border-moss/16 bg-cream/82 p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            もう一度試す
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/10 bg-cream/82 px-5 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            ホームへ戻る
          </Link>
        </div>
      </section>
    </div>
  );
}
