"use client";

import { Heart, ShieldBan, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import React, { useRef, useState, useTransition } from "react";
import type { KeyboardEvent } from "react";

import { blockUserAction, followUserAction, toggleFavoriteAction, unfollowUserAction, unblockUserAction } from "@/lib/actions/connections";
import { isMutualFollow, type BlockedUser, type ConnectionCandidate } from "@/lib/domain/connections";
import type { ConnectionCategory } from "@/lib/validation/request";

type ConnectionPage = { items: ConnectionCandidate[]; nextCursor: string | null };
type CategoryState = ConnectionPage & { loading: boolean; error: string | null; fetched: boolean };
type CategoryStates = Record<ConnectionCategory, CategoryState>;

type ConnectionListProps = {
  initialCategory?: ConnectionCategory;
  initialItems?: ConnectionCandidate[];
  initialNextCursor?: string | null;
  initialError?: string | null;
  counts?: Partial<Record<ConnectionCategory, number>>;
  favorites?: ConnectionCandidate[];
  mutualFollows?: ConnectionCandidate[];
  following?: ConnectionCandidate[];
  candidates?: ConnectionCandidate[];
  blockedUsers?: BlockedUser[];
};

const categoryDetails: Record<ConnectionCategory, { label: string; emptyMessage: string }> = {
  favorites: { label: "お気に入り", emptyMessage: "お気に入りに入れた人はいません。" },
  mutual: { label: "相互フォロー", emptyMessage: "相互フォローの人はいません。" },
  following: { label: "フォロー中", emptyMessage: "フォロー中の人はいません。" },
  shared: { label: "一緒に参加", emptyMessage: "一緒に参加している人がいません。" },
  blocked: { label: "ブロック中", emptyMessage: "ブロック中の人はいません。" }
};

function emptyState(): CategoryState {
  return { items: [], nextCursor: null, loading: false, error: null, fetched: false };
}

function legacyInitialStates({ favorites = [], mutualFollows = [], following = [], candidates = [], blockedUsers = [] }: ConnectionListProps): CategoryStates {
  const blocked = blockedUsers.map((person) => ({
    userId: person.userId,
    displayName: person.displayName,
    sharedEventCount: 0,
    latestSharedAt: "",
    isFollowing: false,
    isFollowedBy: false,
    isFavorite: false
  }));
  return {
    favorites: { ...emptyState(), items: favorites, fetched: true },
    mutual: { ...emptyState(), items: mutualFollows, fetched: true },
    following: { ...emptyState(), items: following, fetched: true },
    shared: { ...emptyState(), items: candidates, fetched: true },
    blocked: { ...emptyState(), items: blocked, fetched: true }
  };
}

function deduplicate(items: ConnectionCandidate[]): ConnectionCandidate[] {
  return [...new Map(items.map((item) => [item.userId, item])).values()];
}

export function ConnectionList(props: ConnectionListProps) {
  const {
    initialCategory = "favorites",
    initialItems,
    initialNextCursor = null,
    initialError = null,
    counts = {}
  } = props;
  const [activeCategory, setActiveCategory] = useState<ConnectionCategory>(initialCategory);
  const [states, setStates] = useState<CategoryStates>(() => {
    if (!initialItems) return legacyInitialStates(props);
    const result: CategoryStates = {
      favorites: emptyState(),
      mutual: emptyState(),
      following: emptyState(),
      shared: emptyState(),
      blocked: emptyState()
    };
    result[initialCategory] = {
      items: initialItems,
      nextCursor: initialNextCursor,
      loading: false,
      error: initialError,
      fetched: initialError === null
    };
    return result;
  });
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const inFlight = useRef(new Set<ConnectionCategory>());
  const active = states[activeCategory];
  const categories = Object.keys(categoryDetails) as ConnectionCategory[];

  async function loadCategory(category: ConnectionCategory, cursor: string | null = null) {
    if (inFlight.current.has(category)) return;
    inFlight.current.add(category);
    setStates((current) => ({
      ...current,
      [category]: { ...current[category], loading: true, error: null }
    }));

    try {
      const parameters = new URLSearchParams({ category });
      if (cursor) parameters.set("cursor", cursor);
      const response = await fetch(`/api/connections?${parameters.toString()}`);
      if (!response.ok) throw new Error("Request failed");
      const page = await response.json() as ConnectionPage;
      if (!Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== "string")) throw new Error("Invalid response");
      setStates((current) => {
        const previous = current[category];
        return {
          ...current,
          [category]: {
            items: cursor ? deduplicate([...previous.items, ...page.items]) : deduplicate(page.items),
            nextCursor: page.nextCursor,
            loading: false,
            error: null,
            fetched: true
          }
        };
      });
    } catch {
      setStates((current) => ({
        ...current,
        [category]: { ...current[category], loading: false, error: "読み込めませんでした。もう一度お試しください。" }
      }));
    } finally {
      inFlight.current.delete(category);
    }
  }

  function selectCategory(category: ConnectionCategory) {
    setActiveCategory(category);
    if (!states[category].fetched && !states[category].loading) void loadCategory(category);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % categories.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + categories.length) % categories.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = categories.length - 1;
    else return;
    event.preventDefault();
    selectCategory(categories[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="connection-guide-title" className="border-y border-ink/10 py-4">
        <h2 id="connection-guide-title" className="text-sm font-bold text-ink">つながりの使いかた</h2>
        <ul className="mt-3 grid gap-3 text-sm text-ink/70 md:grid-cols-3">
          <li className="flex items-start gap-2"><UserPlus aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-pine" /><p>フォローすると、次のイベントへ招待しやすくなります。</p></li>
          <li className="flex items-start gap-2"><Heart aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-clay" /><p>お気に入りは、フォロー中の人を見つけやすくする目印です。</p></li>
          <li className="flex items-start gap-2"><ShieldBan aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-clay" /><p>ブロックすると、お互いのフォローとお気に入りが外れます。</p></li>
          <li className="flex items-start gap-2"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-pine" /><p>相互フォローになると、1対1のチャットを使えます。</p></li>
        </ul>
      </section>

      <label className="grid gap-2 sm:hidden" htmlFor="connection-group-select">
        <span className="text-sm font-bold text-ink">表示するつながり</span>
        <select id="connection-group-select" value={activeCategory} onChange={(event) => selectCategory(event.target.value as ConnectionCategory)} className="min-h-11 w-full rounded-control border border-line bg-surface px-3 py-2 text-base font-bold text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20">
          {categories.map((category) => <option key={category} value={category}>{`${categoryDetails[category].label} (${counts[category] ?? states[category].items.length}人)`}</option>)}
        </select>
      </label>

      <div className="hidden pb-1 sm:block">
        <div role="tablist" aria-label="つながりを切り替える" className="flex flex-wrap gap-2">
          {categories.map((category, index) => {
            const selected = category === activeCategory;
            return <button key={category} ref={(node) => { tabRefs.current[index] = node; }} id={`connection-tab-${category}`} type="button" role="tab" aria-selected={selected} aria-controls={`connection-panel-${category}`} tabIndex={selected ? 0 : -1} onClick={() => selectCategory(category)} onKeyDown={(event) => handleTabKeyDown(event, index)} className={selected ? "inline-flex min-h-11 items-center gap-2 rounded-full bg-pine px-4 py-2 text-sm font-bold text-white shadow-soft focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2" : "inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-sm font-bold text-ink/70 transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"}>
              <span>{categoryDetails[category].label}</span><span className={selected ? "text-white/80" : "text-ink/50"}>{counts[category] ?? states[category].items.length}人</span>
            </button>;
          })}
        </div>
      </div>

      <section id={`connection-panel-${activeCategory}`} role="tabpanel" aria-labelledby={`connection-tab-${activeCategory}`} className="space-y-3">
        <h2 className="text-xl font-semibold text-ink">{categoryDetails[activeCategory].label}</h2>
        {active.loading && active.items.length === 0 ? <p className="rounded-lg border border-ink/8 bg-white/55 p-5 text-sm text-ink/65" role="status">読み込み中です。</p> : null}
        {active.items.length > 0 ? activeCategory === "blocked" ? active.items.map((person) => <BlockedUserRow key={person.userId} person={person} />) : active.items.map((person) => <ConnectionRow key={person.userId} person={person} />) : !active.loading ? <p className="rounded-lg border border-ink/8 bg-white/55 p-5 text-sm text-ink/65">{categoryDetails[activeCategory].emptyMessage}</p> : null}
        {active.error ? <div className="flex flex-wrap items-center gap-3" role="alert"><p className="text-sm font-semibold text-clay-ink">{active.error}</p><button type="button" onClick={() => void loadCategory(activeCategory, active.nextCursor)} className="min-h-11 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2">再試行</button></div> : null}
        {active.nextCursor ? <button type="button" disabled={active.loading} onClick={() => void loadCategory(activeCategory, active.nextCursor)} className="min-h-11 rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">さらに20件表示</button> : null}
      </section>
    </div>
  );
}

function ConnectionRow({ person }: { person: ConnectionCandidate }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  function run(action: (userId: string) => Promise<void>) { setError(null); startTransition(async () => { try { await action(person.userId); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作を完了できませんでした。"); } }); }
  return <article className="rounded-control border border-line bg-surface p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-semibold text-ink">{person.displayName}</p><p className="mt-1 text-sm text-muted">共通のイベント {person.sharedEventCount}件{isMutualFollow(person) ? "・相互フォロー" : person.isFollowing ? "・フォロー中" : ""}</p></div><div className="flex flex-wrap gap-2"><ActionButton label={person.isFollowing ? "フォローを解除" : "フォロー"} icon={person.isFollowing ? UserMinus : UserPlus} disabled={isPending} onClick={() => run(person.isFollowing ? unfollowUserAction : followUserAction)} /><ActionButton label={person.isFavorite ? "お気に入りを外す" : "お気に入りにする"} icon={Heart} disabled={isPending || (!person.isFollowing && !person.isFavorite)} active={person.isFavorite} title={person.isFollowing || person.isFavorite ? undefined : "フォローするとお気に入りにできます"} onClick={() => run(toggleFavoriteAction)} /><ActionButton label="ブロック" icon={ShieldBan} disabled={isPending} danger onClick={() => setConfirmingBlock(true)} /></div></div>{confirmingBlock ? <div className="mt-4 rounded-control border border-clay/25 bg-clay/10 p-3" aria-live="polite"><p className="text-sm font-semibold text-ink">{person.displayName}さんをブロックしますか？</p><p className="mt-1 text-sm text-muted">お互いのフォローとお気に入りも解除されます。</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={isPending} onClick={() => run(blockUserAction)} className="inline-flex min-h-11 items-center justify-center rounded-full bg-clay px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">ブロックする</button><button type="button" disabled={isPending} onClick={() => setConfirmingBlock(false)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2">やめる</button></div></div> : null}{error ? <p className="mt-3 text-sm font-semibold text-clay-ink" role="alert">{error}</p> : null}</article>;
}

function BlockedUserRow({ person }: { person: BlockedUser }) {
  const [isPending, startTransition] = useTransition(); const [error, setError] = useState<string | null>(null);
  function unblock() { setError(null); startTransition(async () => { try { await unblockUserAction(person.userId); } catch (cause) { setError(cause instanceof Error ? cause.message : "ブロックを解除できませんでした。"); } }); }
  return <article className="rounded-control border border-line bg-surface p-4 shadow-soft"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-semibold text-ink">{person.displayName}</p><p className="mt-1 text-sm text-muted">解除しても、以前のフォローやお気に入りは戻りません。</p></div><button type="button" aria-label={`${person.displayName}のブロックを解除`} disabled={isPending} onClick={unblock} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-moss/40 bg-white px-4 py-2 text-sm font-bold text-pine transition-colors hover:bg-moss/10 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"><ShieldCheck aria-hidden="true" className="h-4 w-4" />ブロックを解除</button></div>{error ? <p className="mt-3 text-sm font-semibold text-clay-ink" role="alert">{error}</p> : null}</article>;
}

function ActionButton({ label, icon: Icon, disabled, active = false, danger = false, title, onClick }: { label: string; icon: typeof Heart; disabled: boolean; active?: boolean; danger?: boolean; title?: string; onClick: () => void }) {
  return <button type="button" aria-label={label} title={title} disabled={disabled} onClick={onClick} className={danger ? "inline-flex h-11 w-11 items-center justify-center rounded-full border border-clay/30 bg-white text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" : active ? "inline-flex h-11 w-11 items-center justify-center rounded-full bg-clay/12 text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" : "inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-ink hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"}><Icon aria-hidden="true" className="h-4 w-4" /></button>;
}
