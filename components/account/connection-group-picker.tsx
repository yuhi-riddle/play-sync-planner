"use client";

import React, { useState, useTransition } from "react";
import { clsx } from "clsx";

import { createConnectionGroupAction, setPersonConnectionGroupsAction } from "@/lib/actions/account/connection-groups";
import {
  connectionGroupDotClass,
  connectionGroupLimits,
  defaultConnectionGroupColor,
  type ConnectionGroup
} from "@/lib/domain/account/connection-groups";

export function ConnectionGroupPicker({
  person,
  groups,
  selectedGroupIds,
  onClose
}: {
  person: { userId: string; displayName: string };
  groups: ConnectionGroup[];
  selectedGroupIds: string[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(selectedGroupIds);
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canCreateGroup = groups.length < connectionGroupLimits.groups;

  function createAndAdd() {
    setError(null);
    startTransition(async () => {
      // 色は既定色。あとからグループ画面で変えられる。
      const result = await createConnectionGroupAction({
        name: newGroupName,
        color: defaultConnectionGroupColor,
        memberIds: [person.userId]
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      onClose();
    });
  }

  function toggle(groupId: string) {
    setSelected((current) => (current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setPersonConnectionGroupsAction(person.userId, selected);
      if (result.status === "error") {
        setError(result.message ?? "グループを保存できませんでした");
        return;
      }
      onClose();
    });
  }

  return (
    <div role="group" aria-label={`${person.displayName}を入れるグループ`} className="mt-3 grid gap-2 rounded-control border border-line bg-sunken p-3">
      {groups.length === 0 ? (
        <p className="text-sm text-muted">まだグループがありません。下で作れます。</p>
      ) : (
        <ul className="grid gap-1">
          {groups.map((group) => {
            const wasMember = selectedGroupIds.includes(group.id);
            const isFull = !wasMember && group.memberCount >= connectionGroupLimits.members;
            return (
              <li key={group.id}>
                <label className={clsx("flex min-h-11 items-center gap-2 text-sm", isFull ? "text-muted" : "text-ink")}>
                  <input
                    type="checkbox"
                    checked={selected.includes(group.id)}
                    disabled={isFull}
                    onChange={() => toggle(group.id)}
                    className="h-5 w-5 shrink-0 accent-moss focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                  />
                  <span aria-hidden="true" className={clsx("h-2.5 w-2.5 rounded-full", connectionGroupDotClass[group.color])} />
                  <span>{group.name}</span>
                  {isFull ? <span className="ml-auto text-caption">30人まで</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {canCreateGroup ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1" htmlFor={`new-group-for-${person.userId}`}>
            <span className="text-caption font-bold text-ink">新しいグループを作って入れる</span>
            <input
              id={`new-group-for-${person.userId}`}
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              maxLength={connectionGroupLimits.nameLength}
              placeholder="グループ名"
              className="min-h-11 rounded-control border border-line-strong bg-white px-3 text-body text-ink focus:outline-none focus:ring-2 focus:ring-clay"
            />
          </label>
          <button
            type="button"
            disabled={isPending || newGroupName.trim().length === 0}
            onClick={createAndAdd}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-moss px-4 py-2 text-sm font-bold text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:opacity-60"
          >
            作って入れる
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-clay-ink">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {groups.length > 0 ? (
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-5 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:opacity-60"
          >
            保存する
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
