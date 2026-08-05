import { Trash2 } from "lucide-react";
import React from "react";

import { EmptyState } from "@/components/ui";
import {
  buildTimetableBlocks,
  groupTimetableItemsByDate,
  resolveCurrentTimetableItemIds,
  resolveTimetableDurations,
  type TimetableAssignee,
  type TimetableBlock,
  type TimetableItem
} from "@/lib/domain/plan-timetable";
import { formatDate, formatJstTime } from "@/lib/format";

type DeleteAction = (itemId: string) => (formData: FormData) => void | Promise<void>;

const inactiveStatuses = new Set(["declined", "cancelled"]);

const iconButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2";

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) {
    return `${rest}分`;
  }
  if (rest === 0) {
    return `${hours}時間`;
  }

  return `${hours}時間${rest}分`;
}

function AssigneeChips({ assignees }: { assignees: TimetableAssignee[] }) {
  if (assignees.length === 0) {
    return null;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {assignees.map((assignee) => {
        const isInactive = inactiveStatuses.has(assignee.status);
        // declined（辞退）と cancelled（参加取消）は取り消し線では同じ扱いだが、
        // バッジの文言までは同じにすると「取り消した人」に「辞退」と出て誤解を招く。
        const inactiveLabel = assignee.status === "declined" ? "辞退" : "取消";

        return (
          <span
            key={assignee.participantId}
            className="rounded-full border border-line bg-sunken px-2 py-0.5 text-xs text-muted"
          >
            <span className={isInactive ? "line-through" : undefined}>{assignee.displayName}</span>
            {isInactive ? <span className="ml-1 text-subtle">{inactiveLabel}</span> : null}
          </span>
        );
      })}
    </span>
  );
}

function TimetableRow({
  item,
  durationMinutes,
  isCurrent,
  canEdit,
  deleteAction
}: {
  item: TimetableItem;
  durationMinutes: number | undefined;
  isCurrent: boolean;
  canEdit: boolean;
  deleteAction: DeleteAction;
}) {
  return (
    <div
      data-testid={`timetable-item-${item.id}`}
      className={`flex flex-col gap-2 rounded-control border p-3 sm:flex-row sm:items-start sm:gap-3 ${
        isCurrent ? "border-moss bg-mist/45" : "border-line bg-surface"
      }`}
    >
      <div className="shrink-0 text-body font-bold text-ink sm:w-24">
        {formatJstTime(item.startAt)}
        {item.endAt ? <span className="text-caption font-normal text-muted"> - {formatJstTime(item.endAt)}</span> : null}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words text-body font-medium text-ink">{item.title}</span>
          {isCurrent ? <span className="text-caption font-bold text-pine">▶ いまここ</span> : null}
        </div>

        {item.note ? <p className="break-words text-caption text-muted">{item.note}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          {durationMinutes === undefined ? null : (
            <span className="text-caption text-subtle">{formatDuration(durationMinutes)}</span>
          )}
          <AssigneeChips assignees={item.assignees} />
        </div>
      </div>

      {canEdit ? (
        <form action={deleteAction(item.id)}>
          <button type="submit" className={iconButtonClass} aria-label={`${item.title}を削除`}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </form>
      ) : null}
    </div>
  );
}

function TimetableBlockView({
  block,
  durations,
  current,
  canEdit,
  deleteAction
}: {
  block: TimetableBlock;
  durations: Record<string, number>;
  current: Set<string>;
  canEdit: boolean;
  deleteAction: DeleteAction;
}) {
  if (block.kind === "single") {
    return (
      <TimetableRow
        item={block.item}
        durationMinutes={durations[block.item.id]}
        isCurrent={current.has(block.item.id)}
        canEdit={canEdit}
        deleteAction={deleteAction}
      />
    );
  }

  // 375px で3列に割ると1列が100pxを切って読めなくなるので、3レーン以上は縦に積む。
  const laneColumnClass = block.lanes.length >= 3 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";

  return (
    <div className="rounded-control border border-line-strong bg-sunken p-3">
      <p className="text-caption font-bold text-pine">⑂ {formatJstTime(block.startAt)} から 二手に分かれる</p>

      <div data-testid="timetable-lanes" className={`mt-3 grid gap-3 ${laneColumnClass}`}>
        {block.lanes.map((lane) => (
          <div key={lane.key} className="space-y-2">
            {lane.assignees.length > 0 ? <AssigneeChips assignees={lane.assignees} /> : null}
            {lane.items.map((item) => (
              <TimetableRow
                key={item.id}
                item={item}
                durationMinutes={durations[item.id]}
                isCurrent={current.has(item.id)}
                canEdit={canEdit}
                deleteAction={deleteAction}
              />
            ))}
          </div>
        ))}
      </div>

      <p className="mt-3 text-caption font-bold text-pine">⑃ {formatJstTime(block.endAt)} に合流</p>
    </div>
  );
}

export function PlanTimetable({
  items,
  now,
  canEdit,
  deleteAction
}: {
  items: TimetableItem[];
  now: Date;
  canEdit: boolean;
  deleteAction: DeleteAction;
}) {
  if (items.length === 0) {
    return <EmptyState>まだ進行表はありません。集合・移動・解散の時刻を書いておくと、当日に迷いません。</EmptyState>;
  }

  const groups = groupTimetableItemsByDate(items);
  const durations = resolveTimetableDurations(items);
  const current = resolveCurrentTimetableItemIds(items, now);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.dateKey} className="space-y-2">
          {groups.length > 1 ? (
            <h3 data-testid="timetable-date-heading" className="text-title text-ink">
              {formatDate(group.dateKey)}
            </h3>
          ) : null}

          {buildTimetableBlocks(group.items).map((block) => (
            <TimetableBlockView
              key={block.kind === "single" ? block.item.id : `branch-${block.startAt}`}
              block={block}
              durations={durations}
              current={current}
              canEdit={canEdit}
              deleteAction={deleteAction}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
