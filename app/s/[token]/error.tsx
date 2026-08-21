"use client";

import { useEffect } from "react";

export default function PublicShareErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-6">
      <section className="rounded-control border border-line bg-surface p-5 shadow-soft backdrop-blur">
        <p className="text-eyebrow uppercase text-pine">Madoi</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-ink sm:text-4xl">うまく表示できませんでした</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          一時的な通信エラーか、ページの読み込みに失敗した可能性があります。もう一度試してください。うまく直らない場合は、共有元の方にご確認ください。
        </p>
        {error.digest ? (
          <p className="mt-3 text-caption text-subtle">エラーコード: {error.digest}</p>
        ) : null}
      </section>

      <section className="rounded-control border border-moss/16 bg-surface p-5 shadow-soft">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:from-pine-deep hover:to-pine-deep focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          もう一度試す
        </button>
      </section>
    </div>
  );
}
