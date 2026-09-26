"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import React, { useRef, useState, useTransition } from "react";
import { clsx } from "clsx";

import { ConnectionGroupColorField } from "@/components/account/connection-group-color-field";
import {
  addConnectionGroupMembersAction,
  deleteConnectionGroupAction,
  loadConnectionGroupCandidatesAction,
  removeConnectionGroupMemberAction,
  updateConnectionGroupAction
} from "@/lib/actions/account/connection-groups";
import {
  connectionGroupDotClass,
  connectionGroupLimits,
  type ConnectionGroup,
  type ConnectionGroupColor,
  type ConnectionGroupMember
} from "@/lib/domain/account/connection-groups";

const primaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-5 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-white px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export function ConnectionGroupDetail({ group, members }: { group: ConnectionGroup; members: ConnectionGroupMember[] }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState<ConnectionGroupColor>(group.color);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [candidates, setCandidates] = useState<ConnectionGroupMember[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const membersHeadingRef = useRef<HTMLHeadingElement>(null);
  // パネルや確認を閉じたら、開いたボタンにフォーカスを戻す（閉じた要素と一緒にフォーカスが消えないように）
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const addMembersButtonRef = useRef<HTMLButtonElement>(null);

  function closeEditing() {
    setIsEditing(false);
    editButtonRef.current?.focus();
  }

  function closeDeleteConfirm() {
    setConfirmingDelete(false);
    deleteButtonRef.current?.focus();
  }
  const remaining = Math.max(connectionGroupLimits.members - group.memberCount, 0);

  function run(action: () => Promise<{ status: string; message?: string }>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.status === "error") {
          setError(result.message ?? "操作を完了できませんでした");
          return;
        }
        onSuccess?.();
      } catch (cause) {
        unstable_rethrow(cause);
        setError(cause instanceof Error ? cause.message : "操作を完了できませんでした");
      }
    });
  }

  function openCandidates() {
    setError(null);
    startTransition(async () => {
      try {
        setCandidates(await loadConnectionGroupCandidatesAction(group.id));
        setSelected([]);
      } catch (cause) {
        unstable_rethrow(cause);
        setError(cause instanceof Error ? cause.message : "候補を読み込めませんでした");
      }
    });
  }

  function toggleCandidate(userId: string) {
    setSelected((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  return (
    <div className="grid gap-6">
      <Link href="/connections" className="text-sm font-bold text-pine underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-clay">
        ← つながりへ戻る
      </Link>

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden="true" className={clsx("h-3.5 w-3.5 rounded-full", connectionGroupDotClass[group.color])} />
          <h1 className="text-title text-ink">{group.name}</h1>
          <span className="text-body text-muted">{group.memberCount}人</span>
        </div>
        <p className="text-caption text-muted">このグループは自分だけに見えます。メンバーには通知されません。</p>
        <div className="flex flex-wrap gap-2">
          <button ref={editButtonRef} type="button" className={secondaryButton} onClick={() => setIsEditing((open) => !open)}>
            名前と色を変える
          </button>
          <button
            ref={deleteButtonRef}
            type="button"
            className={clsx(secondaryButton, "text-clay-ink")}
            onClick={() => setConfirmingDelete(true)}
          >
            グループを削除
          </button>
        </div>

        {isEditing ? (
          <form
            className="grid gap-3 rounded-control border border-line bg-surface p-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => updateConnectionGroupAction(group.id, { name, color }), closeEditing);
            }}
          >
            <label className="grid gap-1" htmlFor="connection-group-name">
              <span className="text-body font-bold text-ink">グループ名</span>
              <input
                id="connection-group-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={connectionGroupLimits.nameLength}
                required
                className="min-h-11 rounded-control border border-line-strong bg-white px-3 text-body text-ink focus:outline-none focus:ring-2 focus:ring-clay"
              />
            </label>
            <ConnectionGroupColorField name="connection-group-color" value={color} onChange={setColor} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={isPending} className={primaryButton}>
                保存する
              </button>
              <button type="button" className={secondaryButton} onClick={closeEditing}>
                やめる
              </button>
            </div>
          </form>
        ) : null}

        {confirmingDelete ? (
          <div className="rounded-control border border-clay/25 bg-clay/10 p-3" aria-live="polite">
            <p className="text-sm font-semibold text-ink">
              「{group.name}」を削除しますか？ メンバーとのつながりはそのまま残ります。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => deleteConnectionGroupAction(group.id))}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-clay px-4 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:opacity-60"
              >
                削除する
              </button>
              <button type="button" className={secondaryButton} onClick={closeDeleteConfirm}>
                やめる
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <section aria-labelledby="connection-group-members-heading" className="grid gap-3">
        <h2
          ref={membersHeadingRef}
          id="connection-group-members-heading"
          tabIndex={-1}
          className="text-xl font-semibold text-ink focus:outline-none"
        >
          メンバー
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted">まだメンバーがいません。「メンバーを追加」から入れられます。</p>
        ) : (
          <ul aria-label="メンバー" className="grid gap-2">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface p-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{member.displayName}</span>
                  <span className="block text-caption text-muted">
                    共通のイベント {member.sharedEventCount}件{member.isFollowing ? "・フォロー中" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  aria-label={`${member.displayName}をグループから外す`}
                  onClick={() => run(() => removeConnectionGroupMemberAction(group.id, member.userId), () => membersHeadingRef.current?.focus())}
                  className={secondaryButton}
                >
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-1">
          <button
            ref={addMembersButtonRef}
            type="button"
            disabled={remaining === 0 || isPending}
            onClick={openCandidates}
            className={secondaryButton}
          >
            メンバーを追加
          </button>
          {remaining === 0 ? <p className="text-caption text-muted">1つのグループに入れられるのは30人までです</p> : null}
        </div>

        {candidates ? (
          <div role="group" aria-label="追加する人" className="grid gap-2 rounded-control border border-line bg-sunken p-3">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted">追加できる人がいません。一緒にイベントに参加した人か、フォロー中の人を入れられます。</p>
            ) : (
              <ul className="grid gap-1">
                {candidates.map((candidate) => {
                  const checked = selected.includes(candidate.userId);
                  return (
                    <li key={candidate.userId}>
                      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && selected.length >= remaining}
                          onChange={() => toggleCandidate(candidate.userId)}
                          className="h-5 w-5 shrink-0 accent-moss focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                        />
                        {candidate.displayName}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {selected.length > 0 ? (
                <button
                  type="button"
                  disabled={isPending}
                  className={primaryButton}
                  onClick={() =>
                    run(
                      () => addConnectionGroupMembersAction(group.id, selected),
                      () => {
                        setCandidates(null);
                        membersHeadingRef.current?.focus();
                      }
                    )
                  }
                >
                  {selected.length}人を追加
                </button>
              ) : null}
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  setCandidates(null);
                  addMembersButtonRef.current?.focus();
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-clay-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
