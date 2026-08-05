"use client";

import React, { useState } from "react";
import { clsx } from "clsx";

export type TimetableParticipantOption = {
  participantId: string;
  displayName: string;
  status: string;
};

/** 辞退・キャンセルの人は新しい担当の候補から外す。 */
const inactiveStatuses = new Set(["declined", "cancelled"]);

export function ParticipantToggleChips({
  participants,
  defaultSelectedIds = [],
  label = "担当"
}: {
  participants: TimetableParticipantOption[];
  defaultSelectedIds?: string[];
  label?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelectedIds);

  // 辞退した人でも、すでに担当になっているなら勝手に外さない。外れるほうが事故になる。
  const options = participants.filter(
    (participant) => !inactiveStatuses.has(participant.status) || selected.includes(participant.participantId)
  );
  const activeIds = participants
    .filter((participant) => !inactiveStatuses.has(participant.status))
    .map((participant) => participant.participantId);

  const toggle = (participantId: string) => {
    setSelected((current) =>
      current.includes(participantId)
        ? current.filter((id) => id !== participantId)
        : [...current, participantId]
    );
  };

  return (
    <div>
      <span className="text-caption text-muted">{label}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          // 置き換えではなく合流させる。置き換えだと、辞退済みだが担当になっている人が
          // ここで選択から外れ、options フィルタの都合でチップごと消えて同じ画面では戻せなくなる。
          onClick={() => setSelected((current) => [...new Set([...current, ...activeIds])])}
          className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted transition-colors hover:border-moss hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
        >
          全員
        </button>

        {options.map((participant) => {
          const isSelected = selected.includes(participant.participantId);
          const isInactive = inactiveStatuses.has(participant.status);

          return (
            <button
              key={participant.participantId}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(participant.participantId)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay",
                isSelected
                  ? "border-moss bg-mist/45 text-pine"
                  : "border-line bg-surface text-muted hover:border-moss hover:text-pine"
              )}
            >
              <span className={isInactive ? "line-through" : undefined}>{participant.displayName}</span>
              {isInactive ? <span className="ml-1 font-normal text-subtle">辞退</span> : null}
            </button>
          );
        })}
      </div>

      {selected.map((participantId) => (
        <input key={participantId} type="hidden" name="participant_ids" value={participantId} />
      ))}
    </div>
  );
}
