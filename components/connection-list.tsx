"use client";

import { Heart, ShieldBan, UserMinus, UserPlus } from "lucide-react";
import React, { useState, useTransition } from "react";

import {
  blockUserAction,
  followUserAction,
  toggleFavoriteAction,
  unfollowUserAction
} from "@/lib/actions/connections";
import { isMutualFollow, type ConnectionCandidate } from "@/lib/domain/connections";

type ConnectionListProps = {
  favorites: ConnectionCandidate[];
  mutualFollows?: ConnectionCandidate[];
  following: ConnectionCandidate[];
  candidates: ConnectionCandidate[];
};

export function ConnectionList({ favorites, mutualFollows = [], following, candidates }: ConnectionListProps) {
  return (
    <div className="space-y-6">
      <ConnectionSection title="お気に入り" people={favorites} emptyMessage="お気に入りにした人はいません。" />
      <ConnectionSection title="相互フォロー" people={mutualFollows} emptyMessage="相互フォローの人はいません。" />
      <ConnectionSection title="フォロー中" people={following} emptyMessage="フォロー中の人はいません。" />
      <ConnectionSection title="一緒に参加している人" people={candidates} emptyMessage="一緒に参加している人がまだいません。" />
    </div>
  );
}

function ConnectionSection({ title, people, emptyMessage }: { title: string; people: ConnectionCandidate[]; emptyMessage: string }) {
  return (
    <section aria-labelledby={`connection-${title}`} className="rounded-control border border-line bg-surface p-5 shadow-soft">
      <h2 id={`connection-${title}`} className="text-xl font-semibold text-ink">
        {title}
      </h2>
      <div className="mt-4 space-y-3">
        {people.length > 0 ? people.map((person) => <ConnectionRow key={person.userId} person={person} />) : <p className="text-sm text-muted">{emptyMessage}</p>}
      </div>
    </section>
  );
}

function ConnectionRow({ person }: { person: ConnectionCandidate }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  function run(action: (userId: string) => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action(person.userId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "操作を完了できませんでした。");
      }
    });
  }

  return (
    <article className="rounded-control border border-line bg-surface p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{person.displayName}</p>
          <p className="mt-1 text-sm text-muted">
            共通のイベント {person.sharedEventCount}件
            {isMutualFollow(person) ? "・相互フォロー" : person.isFollowing ? "・フォロー中" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label={person.isFollowing ? "フォローを解除" : "フォロー"}
            icon={person.isFollowing ? UserMinus : UserPlus}
            disabled={isPending}
            onClick={() => run(person.isFollowing ? unfollowUserAction : followUserAction)}
          />
          <ActionButton
            label={person.isFavorite ? "お気に入りを外す" : "お気に入りにする"}
            icon={Heart}
            disabled={isPending || (!person.isFollowing && !person.isFavorite)}
            active={person.isFavorite}
            title={person.isFollowing || person.isFavorite ? undefined : "フォローするとお気に入りにできます"}
            onClick={() => run(toggleFavoriteAction)}
          />
          <ActionButton label="ブロック" icon={ShieldBan} disabled={isPending} danger onClick={() => setConfirmingBlock(true)} />
        </div>
      </div>
      {confirmingBlock ? (
        <div className="mt-4 rounded-control border border-clay/25 bg-clay/10 p-3" aria-live="polite">
          <p className="text-sm font-semibold text-ink">{person.displayName}さんをブロックしますか？</p>
          <p className="mt-1 text-sm text-muted">相互のフォローとお気に入りも解除されます。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(blockUserAction)}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-clay px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ブロックする
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmingBlock(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              やめる
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm font-semibold text-clay-ink" role="alert">{error}</p> : null}
    </article>
  );
}

function ActionButton({
  label,
  icon: Icon,
  disabled,
  active = false,
  danger = false,
  title,
  onClick
}: {
  label: string;
  icon: typeof Heart;
  disabled: boolean;
  active?: boolean;
  danger?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={
        danger
          ? "inline-flex h-11 w-11 items-center justify-center rounded-full border border-clay/30 bg-white text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          : active
            ? "inline-flex h-11 w-11 items-center justify-center rounded-full bg-clay/12 text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            : "inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-ink hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
