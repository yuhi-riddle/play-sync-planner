"use client";

import React, { FormEvent, useEffect, useRef, useState, useTransition } from "react";

import type { EventMessage } from "@/lib/domain/event-chat";

type MessagePage = { items: EventMessage[]; nextCursor: string | null };
type FailedRequest = { cursor: string | null };

function mergeChronologically(current: EventMessage[], incoming: EventMessage[]): EventMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function isMessagePage(value: unknown): value is MessagePage {
  if (!value || typeof value !== "object") return false;
  const page = value as { items?: unknown; nextCursor?: unknown };
  return (
    Array.isArray(page.items) &&
    (page.nextCursor === null || typeof page.nextCursor === "string") &&
    page.items.every(
      (message) =>
        message &&
        typeof message === "object" &&
        typeof (message as EventMessage).id === "string" &&
        typeof (message as EventMessage).authorName === "string" &&
        typeof (message as EventMessage).body === "string" &&
        typeof (message as EventMessage).createdAt === "string" &&
        typeof (message as EventMessage).isOwn === "boolean"
    )
  );
}

export function EventChat({
  eventId,
  messages,
  nextCursor = null,
  initialError = null,
  action,
  canPost,
  canRecoverPostingPermission = false,
  unavailableReason
}: {
  eventId: string;
  messages: EventMessage[];
  nextCursor?: string | null;
  initialError?: string | null;
  action: (formData: FormData) => Promise<void>;
  canPost: boolean;
  canRecoverPostingPermission?: boolean;
  unavailableReason?: string;
}) {
  const [visibleMessages, setVisibleMessages] = useState(messages);
  const [visibleCursor, setVisibleCursor] = useState(nextCursor);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [effectiveCanPost, setEffectiveCanPost] = useState(canPost);
  const [isPending, startTransition] = useTransition();
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const failedRequestRef = useRef<FailedRequest | null>(initialError ? { cursor: null } : null);
  const previousEventIdRef = useRef(eventId);

  function abortActiveRequest() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    inFlightRef.current = false;
  }

  useEffect(() => () => abortActiveRequest(), []);

  useEffect(() => {
    const eventChanged = previousEventIdRef.current !== eventId;
    previousEventIdRef.current = eventId;
    abortActiveRequest();
    setVisibleMessages((current) => eventChanged ? messages : mergeChronologically(current, messages));
    setVisibleCursor(nextCursor);
    setLoadError(initialError);
    setIsLoadingMore(false);
    failedRequestRef.current = initialError ? { cursor: null } : null;
  }, [eventId, initialError, messages, nextCursor]);

  useEffect(() => {
    setEffectiveCanPost(canPost);
  }, [canPost, eventId]);

  async function loadMessages(cursor: string | null) {
    if (inFlightRef.current) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    inFlightRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const parameters = new URLSearchParams();
      if (cursor) parameters.set("cursor", cursor);
      const suffix = parameters.toString();
      const response = await fetch(`/api/events/${eventId}/messages${suffix ? `?${suffix}` : ""}`, { signal: controller.signal });
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      if (!response.ok) throw new Error("Request failed");

      const page: unknown = await response.json();
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      if (!isMessagePage(page)) throw new Error("Invalid response");

      setVisibleMessages((current) => mergeChronologically(current, page.items));
      setVisibleCursor(page.nextCursor);
      setLoadError(null);
      failedRequestRef.current = null;
      if (canRecoverPostingPermission && cursor === null) setEffectiveCanPost(true);
    } catch (cause) {
      if (controller.signal.aborted || (cause instanceof Error && cause.name === "AbortError")) return;
      if (controllerRef.current !== controller) return;
      failedRequestRef.current = { cursor };
      setLoadError("メッセージを読み込めませんでした。もう一度お試しください。");
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        inFlightRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }

  function retryLoad() {
    const failedRequest = failedRequestRef.current;
    if (failedRequest) void loadMessages(failedRequest.cursor);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPostError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        await action(formData);
        form.reset();
      } catch (cause) {
        setPostError(cause instanceof Error ? cause.message : "メッセージを送信できませんでした");
      }
    });
  }

  return (
    <section id="chat" aria-labelledby="event-chat-heading" className="space-y-4">
      <div>
        <h2 id="event-chat-heading" className="text-xl font-semibold text-ink">参加者チャット</h2>
        <p className="mt-2 text-sm text-muted">イベント参加者だけが閲覧・投稿できます。</p>
      </div>

      {visibleMessages.length ? (
        <ol className="space-y-3" aria-label="チャットメッセージ">
          {visibleMessages.map((message) => (
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

      <div className="flex flex-wrap items-center gap-3">
        {visibleCursor ? (
          <button
            type="button"
            disabled={isLoadingMore}
            onClick={() => void loadMessages(visibleCursor)}
            className="min-h-11 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            以前のメッセージを表示
          </button>
        ) : null}
        {isLoadingMore ? <p role="status" className="text-sm text-muted">メッセージを読み込み中です。</p> : null}
      </div>

      {loadError ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm font-semibold text-clay-ink">{loadError}</p>
          <button
            type="button"
            disabled={isLoadingMore}
            onClick={retryLoad}
            className="min-h-11 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            再試行
          </button>
        </div>
      ) : null}

      {effectiveCanPost ? (
        <form onSubmit={submit} className="space-y-3 rounded-control border border-line bg-surface p-4">
          <label className="block text-sm font-medium text-ink" htmlFor="event-chat-message">
            メッセージ
          </label>
          <textarea
            id="event-chat-message"
            name="body"
            rows={4}
            maxLength={2000}
            placeholder="参加者にメッセージを送る"
            className="w-full rounded-control border border-moss/18 bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">2,000文字まで</p>
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

      {postError ? <p aria-live="polite" className="text-sm font-semibold text-clay-ink">{postError}</p> : null}
    </section>
  );
}
