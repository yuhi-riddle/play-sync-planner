"use client";

import React, { FormEvent, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";

import type { EventMessage } from "@/lib/domain/event-chat";

export function EventChat({
  messages,
  action,
  canPost,
  unavailableReason
}: {
  messages: EventMessage[];
  action: (formData: FormData) => Promise<void>;
  canPost: boolean;
  unavailableReason?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [bodyLength, setBodyLength] = useState(0);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        await action(formData);
        form.reset();
        setBodyLength(0);
      } catch (cause) {
        unstable_rethrow(cause);
        setError(cause instanceof Error ? cause.message : "メッセージを投稿できませんでした");
      }
    });
  }

  return (
    <section id="chat" aria-labelledby="event-chat-heading" className="space-y-4">
      <div>
        <h2 id="event-chat-heading" className="text-xl font-semibold text-ink">参加者チャット</h2>
        <p className="mt-2 text-sm text-muted">イベント参加者だけが閲覧・投稿できます。</p>
      </div>

      {messages.length ? (
        <ol className="space-y-3" aria-label="チャットメッセージ">
          {messages.map((message) => (
            <li key={message.id} className={message.isOwn ? "ml-auto max-w-xl" : "mr-auto max-w-xl"}>
              <article className={message.isOwn ? "rounded-control bg-mist p-4" : "rounded-control bg-surface p-4"}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-semibold text-ink">{message.isOwn ? "あなた" : message.authorName}</p>
                  <time className="text-xs text-muted" dateTime={message.createdAt}>
                    {new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(message.createdAt))}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{message.body}</p>
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-control border border-line bg-sunken p-6 text-sm text-muted">まだメッセージはありません。最初のひとことを送ってみましょう。</p>
      )}

      {canPost ? (
        <form onSubmit={submit} className="space-y-3 rounded-control border border-line bg-surface p-4">
          <label className="block text-sm font-medium text-ink" htmlFor="event-chat-message">
            メッセージ
          </label>
          <textarea
            id="event-chat-message"
            name="body"
            rows={2}
            maxLength={2000}
            placeholder="参加者にメッセージを送る"
            onChange={(event) => setBodyLength(event.target.value.length)}
            className="w-full rounded-control border border-moss/18 bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">{bodyLength > 1800 ? `残り ${2000 - bodyLength}文字` : ""}</p>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              投稿
            </button>
          </div>
        </form>
      ) : (
        <p className="rounded-control border border-line bg-sunken p-4 text-sm text-muted">
          {unavailableReason ?? "このチャットはイベント参加者のみ利用できます。"}
        </p>
      )}

      {error ? <p aria-live="polite" className="text-sm font-semibold text-clay-ink">{error}</p> : null}
    </section>
  );
}
