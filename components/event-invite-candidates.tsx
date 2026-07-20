"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { sortInviteCandidates, type ConnectionCandidate } from "@/lib/domain/connections";

type InviteCandidatePage = { items: ConnectionCandidate[]; nextCursor: string | null };
type CandidateRequest = { query: string; cursor: string | null };

function deduplicate(candidates: ConnectionCandidate[]): ConnectionCandidate[] {
  return [...new Map(candidates.map((candidate) => [candidate.userId, candidate])).values()];
}

function isInviteCandidatePage(value: unknown): value is InviteCandidatePage {
  if (!value || typeof value !== "object") return false;
  const page = value as { items?: unknown; nextCursor?: unknown };
  return (
    Array.isArray(page.items) &&
    (page.nextCursor === null || typeof page.nextCursor === "string") &&
    page.items.every(
      (candidate) =>
        candidate &&
        typeof candidate === "object" &&
        typeof (candidate as ConnectionCandidate).userId === "string" &&
        typeof (candidate as ConnectionCandidate).displayName === "string" &&
        typeof (candidate as ConnectionCandidate).sharedEventCount === "number" &&
        typeof (candidate as ConnectionCandidate).latestSharedAt === "string" &&
        typeof (candidate as ConnectionCandidate).isFollowing === "boolean" &&
        typeof (candidate as ConnectionCandidate).isFollowedBy === "boolean" &&
        typeof (candidate as ConnectionCandidate).isFavorite === "boolean"
    )
  );
}

export function EventInviteCandidates({
  eventId,
  action
}: {
  eventId: string;
  action: (inviteeUserIds: string[]) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loadedQuery, setLoadedQuery] = useState("");
  const [candidates, setCandidates] = useState<ConnectionCandidate[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const failedRequestRef = useRef<CandidateRequest | null>(null);
  const searchReadyRef = useRef(false);
  const orderedCandidates = useMemo(() => sortInviteCandidates(candidates), [candidates]);

  function abortActiveRequest() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    inFlightRef.current = false;
  }

  useEffect(() => () => abortActiveRequest(), []);

  const loadCandidates = useCallback(async (request: CandidateRequest) => {
    if (inFlightRef.current) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    inFlightRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    try {
      const parameters = new URLSearchParams();
      if (request.query) parameters.set("q", request.query);
      if (request.cursor) parameters.set("cursor", request.cursor);
      const suffix = parameters.toString();
      const response = await fetch(`/api/events/${eventId}/invite-candidates${suffix ? `?${suffix}` : ""}`, { signal: controller.signal });
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      if (!response.ok) throw new Error("Request failed");

      const page: unknown = await response.json();
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      if (!isInviteCandidatePage(page)) throw new Error("Invalid response");

      setCandidates((current) => (request.cursor ? deduplicate([...current, ...page.items]) : deduplicate(page.items)));
      if (!request.cursor) setSelectedIds([]);
      setNextCursor(page.nextCursor);
      setLoadedQuery(request.query);
      setLoadError(null);
      failedRequestRef.current = null;
    } catch (cause) {
      if (controller.signal.aborted || (cause instanceof Error && cause.name === "AbortError")) return;
      if (controllerRef.current !== controller) return;
      failedRequestRef.current = request;
      setLoadError("招待候補を読み込めませんでした。もう一度お試しください。");
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        inFlightRef.current = false;
        setIsLoading(false);
      }
    }
  }, [eventId]);

  useEffect(() => {
    if (!searchReadyRef.current) return;
    const timer = window.setTimeout(() => {
      void loadCandidates({ query, cursor: null });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [loadCandidates, query]);

  function openCandidates() {
    if (isOpen) return;
    abortActiveRequest();
    searchReadyRef.current = true;
    setIsOpen(true);
    setQuery("");
    setLoadedQuery("");
    setCandidates([]);
    setNextCursor(null);
    setSelectedIds([]);
    setLoadError(null);
    setInviteError(null);
    setMessage(null);
    failedRequestRef.current = null;
    void loadCandidates({ query: "", cursor: null });
  }

  function closeCandidates() {
    searchReadyRef.current = false;
    abortActiveRequest();
    setIsOpen(false);
    setIsLoading(false);
    setQuery("");
    setLoadedQuery("");
    setCandidates([]);
    setNextCursor(null);
    setSelectedIds([]);
    setLoadError(null);
    setInviteError(null);
    setMessage(null);
    failedRequestRef.current = null;
  }

  function updateQuery(value: string) {
    abortActiveRequest();
    setIsLoading(false);
    setLoadError(null);
    failedRequestRef.current = null;
    setQuery(value.slice(0, 100));
  }

  function retryLoad() {
    const failedRequest = failedRequestRef.current;
    if (failedRequest && failedRequest.query === query) void loadCandidates(failedRequest);
  }

  function toggle(userId: string) {
    setSelectedIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  function sendInvitations() {
    if (selectedIds.length === 0) {
      setInviteError("招待する人を選んでください。");
      setMessage(null);
      return;
    }

    const invitedIds = selectedIds;
    setInviteError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action(invitedIds);
        setCandidates((current) => current.filter((candidate) => !invitedIds.includes(candidate.userId)));
        setSelectedIds([]);
        setMessage("招待を送りました");
      } catch (cause) {
        setInviteError(cause instanceof Error ? cause.message : "招待を送れませんでした。");
      }
    });
  }

  return (
    <section aria-labelledby="event-invite-candidates-heading" className="space-y-4">
      <div>
        <h2 id="event-invite-candidates-heading" className="text-xl font-semibold text-ink">Madoiで招待</h2>
        <p className="mt-2 text-sm text-muted">一緒に参加した人や、フォロー中・お気に入りの人から選べます。</p>
      </div>

      {!isOpen ? (
        <button
          type="button"
          onClick={openCandidates}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-5 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          招待する人を選ぶ
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="grid min-w-0 flex-1 gap-2" htmlFor="event-invite-candidate-search">
              <span className="text-sm font-bold text-ink">候補を検索</span>
              <input
                id="event-invite-candidate-search"
                type="search"
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                maxLength={100}
                className="min-h-11 w-full rounded-control border border-moss/18 bg-surface px-3 py-2 text-base text-ink outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
              />
            </label>
            <button
              type="button"
              onClick={closeCandidates}
              className="min-h-11 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              候補を閉じる
            </button>
          </div>

          {isLoading && orderedCandidates.length === 0 ? <p role="status" className="rounded-control border border-line bg-sunken p-4 text-sm text-muted">招待候補を読み込み中です。</p> : null}

          {orderedCandidates.length ? (
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
                      aria-label={`${candidate.displayName}を選択`}
                      className="h-5 w-5 shrink-0 accent-moss"
                    />
                  </label>
                );
              })}
            </div>
          ) : !isLoading && !loadError && loadedQuery === query ? (
            <p className="text-sm text-muted">招待できるつながりがまだいません。</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {nextCursor && loadedQuery === query ? (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void loadCandidates({ query, cursor: nextCursor })}
                className="min-h-11 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                さらに20人を表示
              </button>
            ) : null}
            {isLoading && orderedCandidates.length ? <p role="status" className="text-sm text-muted">候補を読み込み中です。</p> : null}
          </div>

          {loadError ? (
            <div className="flex flex-wrap items-center gap-3" role="alert">
              <p className="text-sm font-semibold text-clay-ink">{loadError}</p>
              <button
                type="button"
                disabled={isLoading}
                onClick={retryLoad}
                className="min-h-11 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                再試行
              </button>
            </div>
          ) : null}

          <button
            type="button"
            disabled={isPending || isLoading}
            onClick={sendInvitations}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Madoiで招待を送る
          </button>
        </div>
      )}

      {message ? <p className="text-sm font-semibold text-pine" role="status">{message}</p> : null}
      {inviteError ? <p className="text-sm font-semibold text-clay-ink" role="alert">{inviteError}</p> : null}
    </section>
  );
}
