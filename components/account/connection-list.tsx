"use client";

import { FolderPlus, ShieldBan, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { clsx } from "clsx";
import { unstable_rethrow } from "next/navigation";
import React, { useId, useRef, useState, useTransition } from "react";
import type { KeyboardEvent } from "react";

import { ActiveSharedEventsModal } from "@/components/account/active-shared-events-modal";
import { ConnectionGroupPicker } from "@/components/account/connection-group-picker";
import {
  blockUserAction,
  followUserAction,
  loadActiveSharedEventsAction,
  loadMoreConnectionsAction,
  unfollowUserAction,
  unblockUserAction
} from "@/lib/actions/account/connections";
import type { ActionState } from "@/lib/domain/shared/action-state";
import {
  isMutualFollow,
  toBlockedUser,
  type ActiveSharedEvent,
  type BlockedUser,
  type ConnectionCandidate,
  type ConnectionCategory,
  type ConnectionCursor
} from "@/lib/domain/account/connections";
import { connectionGroupDotClass, type ConnectionGroup } from "@/lib/domain/account/connection-groups";

type ConnectionTabId = Exclude<ConnectionCategory, "favorites">;

export type ConnectionTabData<T> = {
  items: T[];
  totalCount: number;
  nextCursor: ConnectionCursor;
};

const emptyTabData: ConnectionTabData<never> = { items: [], totalCount: 0, nextCursor: null };

type ConnectionListProps = {
  mutualFollows?: ConnectionTabData<ConnectionCandidate>;
  following: ConnectionTabData<ConnectionCandidate>;
  candidates: ConnectionTabData<ConnectionCandidate>;
  blockedUsers?: ConnectionTabData<BlockedUser>;
  groups: ConnectionGroup[];
  groupIdsByMember: Record<string, string[]>;
};

type TabItems = {
  mutual: ConnectionCandidate[];
  following: ConnectionCandidate[];
  shared: ConnectionCandidate[];
  blocked: BlockedUser[];
};

type TabCursors = Record<ConnectionTabId, ConnectionCursor>;

export function ConnectionList({
  mutualFollows = emptyTabData,
  following,
  candidates,
  blockedUsers = emptyTabData,
  groups,
  groupIdsByMember
}: ConnectionListProps) {
  const [items, setItems] = useState<TabItems>(() => ({
    mutual: mutualFollows.items,
    following: following.items,
    shared: candidates.items,
    blocked: blockedUsers.items
  }));
  const [cursors, setCursors] = useState<TabCursors>(() => ({
    mutual: mutualFollows.nextCursor,
    following: following.nextCursor,
    shared: candidates.nextCursor,
    blocked: blockedUsers.nextCursor
  }));
  const [isLoadingMore, startLoadMoreTransition] = useTransition();
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const tabs = [
    {
      id: "shared",
      label: "一緒に参加",
      people: items.shared,
      totalCount: candidates.totalCount,
      emptyMessage: "一緒に参加している人がまだいません。"
    },
    {
      id: "following",
      label: "フォロー中",
      people: items.following,
      totalCount: following.totalCount,
      emptyMessage: "フォロー中の人はいません。"
    },
    {
      id: "mutual",
      label: "相互フォロー",
      people: items.mutual,
      totalCount: mutualFollows.totalCount,
      emptyMessage: "相互フォローの人はいません。"
    },
    {
      id: "blocked",
      label: "ブロック中",
      people: items.blocked,
      totalCount: blockedUsers.totalCount,
      emptyMessage: "ブロック中の人はいません。"
    }
  ] as const;
  const [activeTab, setActiveTab] = useState<ConnectionTabId>(() => tabs.find((tab) => tab.people.length > 0)?.id ?? "shared");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  function loadMore(category: ConnectionTabId) {
    const cursor = cursors[category];
    if (!cursor) return;

    setLoadMoreError(null);
    startLoadMoreTransition(async () => {
      try {
        const page = await loadMoreConnectionsAction(category, cursor);
        setItems((previous) => ({
          ...previous,
          [category]:
            category === "blocked"
              ? [...previous.blocked, ...page.items.map(toBlockedUser)]
              : [...previous[category], ...page.items]
        }));
        setCursors((previous) => ({ ...previous, [category]: page.nextCursor }));
      } catch (cause) {
        unstable_rethrow(cause);
        setLoadMoreError(cause instanceof Error ? cause.message : "続きを読み込めませんでした。");
      }
    });
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="space-y-5">
      <label className="grid gap-2 sm:hidden" htmlFor="connection-group-select">
        <span className="text-sm font-bold text-ink">表示するつながり</span>
        <select
          id="connection-group-select"
          value={activeTab}
          onChange={(event) => setActiveTab(event.target.value as ConnectionTabId)}
          className="min-h-11 w-full rounded-control border border-line bg-surface px-3 py-2 text-base font-bold text-ink focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20 sm:hidden"
        >
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>{`${tab.label} (${tab.totalCount}件)`}</option>
          ))}
        </select>
      </label>

      <div className="hidden pb-1 sm:block">
        <div role="tablist" aria-label="つながりを絞り込む" className="flex flex-wrap gap-2">
          {tabs.map((tab, index) => {
            const selected = tab.id === active.id;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                id={`connection-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`connection-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={
                  selected
                    ? "inline-flex min-h-11 items-center gap-2 rounded-full bg-pine px-4 py-2 text-sm font-bold text-white shadow-soft focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                    : "inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-sm font-bold text-ink/70 transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                }
              >
                <span>{tab.label}</span>
                <span className={selected ? "text-white/80" : "text-ink/50"}>{tab.totalCount}件</span>
              </button>
            );
          })}
        </div>
      </div>

      <section
        id={`connection-panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={`connection-tab-${active.id}`}
        className="space-y-3"
      >
        <h2 className="text-xl font-semibold text-ink">{active.label}</h2>
        {active.people.length > 0 ? (
          active.id === "blocked" ? (
            (active.people as BlockedUser[]).map((person) => <BlockedUserRow key={person.userId} person={person} />)
          ) : (
            (active.people as ConnectionCandidate[]).map((person) => (
              <ConnectionRow
                key={person.userId}
                person={person}
                groups={groups}
                groupIds={groupIdsByMember[person.userId] ?? []}
              />
            ))
          )
        ) : (
          <p className="rounded-lg border border-ink/8 bg-white/55 p-5 text-sm text-ink/65">{active.emptyMessage}</p>
        )}
        {cursors[active.id] ? (
          <div className="pt-1">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={() => loadMore(active.id)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-line bg-white px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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
      </section>
    </div>
  );
}

function ConnectionRow({
  person,
  groups,
  groupIds
}: {
  person: ConnectionCandidate;
  groups: ConnectionGroup[];
  groupIds: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [isPickingGroups, setIsPickingGroups] = useState(false);
  const groupPickerId = `connection-group-picker-${useId()}`;
  const groupPickerButtonRef = useRef<HTMLButtonElement>(null);
  const [activeEvents, setActiveEvents] = useState<ActiveSharedEvent[] | null>(null);
  const [isLoadingActiveEvents, startActiveEventsTransition] = useTransition();
  const [activeEventsError, setActiveEventsError] = useState<string | null>(null);

  function closeGroupPicker() {
    setIsPickingGroups(false);
    groupPickerButtonRef.current?.focus();
  }

  function run(action: (userId: string) => Promise<ActionState>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(person.userId);
        if (result.status === "error") {
          setError(result.message ?? "操作を完了できませんでした。");
        }
      } catch (cause) {
        unstable_rethrow(cause);
        setError(cause instanceof Error ? cause.message : "操作を完了できませんでした。");
      }
    });
  }

  function openActiveEventsModal() {
    setActiveEventsError(null);
    startActiveEventsTransition(async () => {
      try {
        const events = await loadActiveSharedEventsAction(person.userId);
        setActiveEvents(events);
      } catch (cause) {
        unstable_rethrow(cause);
        setActiveEventsError(cause instanceof Error ? cause.message : "読み込めませんでした。");
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
          {person.activeSharedEventCount > 0 ? (
            <button
              type="button"
              disabled={isLoadingActiveEvents}
              onClick={openActiveEventsModal}
              className="mt-1 inline-flex min-h-6 items-center text-sm font-bold text-pine underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-clay disabled:cursor-not-allowed disabled:opacity-60"
            >
              進行中 {person.activeSharedEventCount}件
            </button>
          ) : null}
          {activeEventsError ? <p className="mt-1 text-sm text-clay-ink" role="alert">{activeEventsError}</p> : null}
          {groupIds.length > 0 ? (
            <ul aria-label="所属グループ" className="mt-2 flex flex-wrap gap-1.5">
              {groups
                .filter((group) => groupIds.includes(group.id))
                .map((group) => (
                  <li key={group.id} className="inline-flex items-center gap-1.5 rounded-control bg-sunken px-2 py-0.5 text-caption font-bold text-muted">
                    <span aria-hidden="true" className={clsx("h-2 w-2 rounded-full", connectionGroupDotClass[group.color])} />
                    {group.name}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="グループに入れる"
            icon={FolderPlus}
            buttonRef={groupPickerButtonRef}
            disabled={isPending}
            active={isPickingGroups}
            aria-expanded={isPickingGroups}
            aria-controls={groupPickerId}
            onClick={() => setIsPickingGroups((open) => !open)}
          />
          <ActionButton
            label={person.isFollowing ? "フォローを解除" : "フォロー"}
            icon={person.isFollowing ? UserMinus : UserPlus}
            disabled={isPending}
            onClick={() => run(person.isFollowing ? unfollowUserAction : followUserAction)}
          />
          <ActionButton label="ブロック" icon={ShieldBan} disabled={isPending} danger onClick={() => setConfirmingBlock(true)} />
        </div>
      </div>
      {isPickingGroups ? (
        <ConnectionGroupPicker
          person={person}
          groups={groups}
          selectedGroupIds={groupIds}
          panelId={groupPickerId}
          onClose={closeGroupPicker}
        />
      ) : null}
      {confirmingBlock ? (
        <div className="mt-4 rounded-control border border-clay/25 bg-clay/10 p-3" aria-live="polite">
          <p className="text-sm font-semibold text-ink">{person.displayName}さんをブロックしますか？</p>
          <p className="mt-1 text-sm text-muted">お互いのフォローが解除され、グループからも外れます。</p>
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
      {error ? (
        <p className="mt-3 text-sm font-semibold text-clay-ink" role="alert">
          {error}
        </p>
      ) : null}
      {activeEvents ? (
        <ActiveSharedEventsModal
          displayName={person.displayName}
          events={activeEvents}
          onClose={() => setActiveEvents(null)}
        />
      ) : null}
    </article>
  );
}

function BlockedUserRow({ person }: { person: BlockedUser }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function unblock() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await unblockUserAction(person.userId);
        if (result.status === "error") {
          setError(result.message ?? "ブロックを解除できませんでした。");
        }
      } catch (cause) {
        unstable_rethrow(cause);
        setError(cause instanceof Error ? cause.message : "ブロックを解除できませんでした。");
      }
    });
  }

  return (
    <article className="rounded-control border border-line bg-surface p-4 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{person.displayName}</p>
          <p className="mt-1 text-sm text-muted">解除しても、以前のフォローやグループは戻りません。</p>
        </div>
        <button
          type="button"
          aria-label={`${person.displayName}のブロックを解除`}
          disabled={isPending}
          onClick={unblock}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-moss/40 bg-white px-4 py-2 text-sm font-bold text-pine transition-colors hover:bg-moss/10 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          ブロックを解除
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-sm font-semibold text-clay-ink" role="alert">
          {error}
        </p>
      ) : null}
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
  buttonRef,
  "aria-expanded": ariaExpanded,
  "aria-controls": ariaControls,
  onClick
}: {
  label: string;
  icon: typeof FolderPlus;
  disabled: boolean;
  active?: boolean;
  danger?: boolean;
  title?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      aria-label={label}
      title={title}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
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
