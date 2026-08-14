"use client";

import { unstable_rethrow } from "next/navigation";
import React, { useState, useTransition } from "react";

import type { ActionState } from "@/lib/domain/shared/action-state";
import type { ConnectionCandidate, ConnectionCursor, ConnectionPage } from "@/lib/domain/account/connections";

export function EventInviteCandidates({
  candidates,
  nextCursor,
  action,
  loadMoreAction
}: {
  candidates: ConnectionCandidate[];
  nextCursor: ConnectionCursor;
  action: (inviteeUserIds: string[]) => Promise<ActionState>;
  loadMoreAction: (cursor: ConnectionCursor) => Promise<ConnectionPage>;
}) {
  const [orderedCandidates, setOrderedCandidates] = useState(candidates);
  const [cursor, setCursor] = useState(nextCursor);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, startLoadMoreTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  function loadMore() {
    if (!cursor) return;

    setLoadMoreError(null);
    startLoadMoreTransition(async () => {
      try {
        const page = await loadMoreAction(cursor);
        setOrderedCandidates((current) => [...current, ...page.items]);
        setCursor(page.nextCursor);
      } catch (cause) {
        unstable_rethrow(cause);
        setLoadMoreError(cause instanceof Error ? cause.message : "続きを読み込めませんでした。");
      }
    });
  }

  function toggle(userId: string) {
    setSelectedIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  function sendInvitations() {
    if (selectedIds.length === 0) {
      setError("招待する人を選んでください。");
      setMessage(null);
      return;
    }

    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action(selectedIds);
        if (result.status === "error") {
          setError(result.message ?? "招待を送れませんでした。");
          return;
        }
        setSelectedIds([]);
        setMessage("招待を送りました");
      } catch (cause) {
        unstable_rethrow(cause);
        setError(cause instanceof Error ? cause.message : "招待を送れませんでした。");
      }
    });
  }

  if (orderedCandidates.length === 0) {
    return <p className="text-sm text-muted">招待できるつながりがまだいません。</p>;
  }

  return (
    <section aria-labelledby="event-invite-candidates-heading" className="space-y-4">
      <div>
        <h2 id="event-invite-candidates-heading" className="text-xl font-semibold text-ink">Madoiで招待</h2>
        <p className="mt-2 text-sm text-muted">一緒に参加した人や、フォロー中・お気に入りの人から選べます。</p>
      </div>
      <div className="space-y-2">
        {orderedCandidates.map((candidate) => {
          const checked = selectedIds.includes(candidate.userId);
          return (
            <label key={candidate.userId} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-control border border-line bg-surface p-3">
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{candidate.displayName}</span>
                <span className="mt-1 block text-sm text-muted">
                  {candidate.sharedEventCount > 0
                    ? `一緒だったイベント ${candidate.sharedEventCount}件`
                    : candidate.isFavorite
                      ? "お気に入り"
                      : "フォロー中"}
                </span>
              </span>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(candidate.userId)}
                aria-label={`${candidate.displayName}を招待する`}
                className="h-5 w-5 shrink-0 accent-moss"
              />
            </label>
          );
        })}
      </div>
      {cursor ? (
        <div>
          <button
            type="button"
            disabled={isLoadingMore}
            onClick={loadMore}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-white px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingMore ? "読み込み中…" : "もっと見る"}
          </button>
          {loadMoreError ? (
            <p className="mt-2 text-sm font-semibold text-clay-ink" role="alert">
              {loadMoreError}
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        disabled={isPending}
        onClick={sendInvitations}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Madoiで招待を送る
      </button>
      {message ? <p className="text-sm font-semibold text-pine" role="status">{message}</p> : null}
      {error ? <p className="text-sm font-semibold text-clay-ink" role="alert">{error}</p> : null}
    </section>
  );
}
