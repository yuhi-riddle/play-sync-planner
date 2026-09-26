"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState, useTransition } from "react";
import { clsx } from "clsx";

import { ConnectionGroupColorField } from "@/components/account/connection-group-color-field";
import { createConnectionGroupAction } from "@/lib/actions/account/connection-groups";
import {
  connectionGroupDotClass,
  connectionGroupLimits,
  defaultConnectionGroupColor,
  type ConnectionGroup,
  type ConnectionGroupColor
} from "@/lib/domain/account/connection-groups";

function memberSummary(group: ConnectionGroup) {
  if (group.memberCount === 0) return "まだメンバーがいません";
  const rest = group.memberCount - group.memberNames.length;
  return `${group.memberNames.join("・")}${rest > 0 ? ` ほか${rest}人` : ""}`;
}

export function ConnectionGroupsSection({ groups }: { groups: ConnectionGroup[] }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<ConnectionGroupColor>(defaultConnectionGroupColor);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const wasCreating = useRef(false);
  const isFull = groups.length >= connectionGroupLimits.groups;

  useEffect(() => {
    if (isCreating) {
      nameInputRef.current?.focus();
    } else if (wasCreating.current) {
      createButtonRef.current?.focus();
    }
    wasCreating.current = isCreating;
  }, [isCreating]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createConnectionGroupAction({ name, color });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.push(`/connections/groups/${result.groupId}`);
    });
  }

  return (
    <section aria-labelledby="connection-groups-heading" className="grid gap-3">
      <div className="flex items-baseline gap-2">
        <h2 id="connection-groups-heading" className="text-xl font-semibold text-ink">
          グループ
        </h2>
        <span className="text-caption text-muted">自分だけに見えます</span>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted">よく誘う仲間をまとめておくと、招待のときにまとめて選べます。</p>
      ) : (
        <ul className="grid gap-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/connections/groups/${group.id}`}
                className="grid gap-1 rounded-control border border-line bg-surface p-3 transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              >
                <span className="flex items-center gap-2 font-bold text-ink">
                  <span aria-hidden="true" className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", connectionGroupDotClass[group.color])} />
                  <span className="min-w-0 truncate">{group.name}</span>
                  <span className="ml-auto whitespace-nowrap text-caption font-normal text-muted">{group.memberCount}人</span>
                </span>
                <span className="truncate text-caption text-muted">{memberSummary(group)}</span>
                <span className="text-caption text-muted">進めているイベント {group.activeEventCount}件</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isCreating ? (
        <form onSubmit={submit} className="grid gap-3 rounded-control border border-line bg-surface p-3">
          <label className="grid gap-1" htmlFor="new-connection-group-name">
            <span className="text-body font-bold text-ink">グループ名</span>
            <input
              ref={nameInputRef}
              id="new-connection-group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={connectionGroupLimits.nameLength}
              required
              aria-describedby={error ? "new-connection-group-error" : undefined}
              className="min-h-11 rounded-control border border-line-strong bg-white px-3 text-body text-ink focus:outline-none focus:ring-2 focus:ring-clay"
            />
          </label>
          <ConnectionGroupColorField name="new-connection-group-color" value={color} onChange={setColor} />
          {error ? (
            <p id="new-connection-group-error" role="alert" className="text-sm font-semibold text-clay-ink">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-5 py-2 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:opacity-60"
            >
              作成する
            </button>
            <button
              ref={createButtonRef}
              type="button"
              onClick={() => setIsCreating(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-white px-4 py-2 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              やめる
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-1">
          <button
            type="button"
            disabled={isFull}
            onClick={() => setIsCreating(true)}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-dashed border-moss px-4 py-2 text-sm font-bold text-pine transition-colors hover:bg-mist focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ＋ グループを作る
          </button>
          {isFull ? <p className="text-caption text-muted">グループは20個までです</p> : null}
        </div>
      )}
    </section>
  );
}
