import { Trash2 } from "lucide-react";
import React from "react";

import { EmptyState } from "@/components/ui";
import type { TimetableParticipantOption } from "@/components/participant-toggle-chips";
import { PlanTimetableForm } from "@/components/plan-timetable-form";
import {
  buildTimetableBlocks,
  groupTimetableItemsByDate,
  resolveCurrentTimetableItemIds,
  resolveTimetableDurations,
  toJstDateKey,
  type TimetableAssignee,
  type TimetableBlock,
  type TimetableItem
} from "@/lib/domain/plan-timetable";
import { formatDate, formatJstTime } from "@/lib/format";

type DeleteAction = (itemId: string) => (formData: FormData) => void | Promise<void>;
type EditAction = (itemId: string) => (formData: FormData) => void | Promise<void>;

type EditSupport = {
  /**
   * action / participants / eventDates は常にセットで使う（どれか1つだけあっても編集フォームは作れない）。
   * 3つを別々の optional にすると、どれか1つだけ渡し忘れても型上は素通りしてしまう。
   * 1つの optional にまとめることで、その抜けの種類自体を型で消す。
   */
  edit?: {
    action: EditAction;
    participants: TimetableParticipantOption[];
    eventDates: string[];
  };
};

/**
 * 編集フォームの日付欄の初期値。行の日付が eventDates に無ければ
 * （開催期間を短く確定し直した後など）<select> のどの <option> にも一致せず、
 * ブラウザが先頭の日付を選んでしまう。追加フォーム側（page.tsx の defaultDate）と
 * 同じ防御で、一致しないときは末尾の日付にフォールバックする。
 */
function resolveEditDefaultDate(itemStartAt: string, eventDates: string[]): string {
  const itemDateKey = toJstDateKey(itemStartAt);
  return eventDates.includes(itemDateKey) ? itemDateKey : (eventDates[eventDates.length - 1] ?? itemDateKey);
}

/**
 * 担当から外れた状態と、そのバッジ文言。
 *
 * 状態の一覧と文言を1箇所にまとめるのは、片方だけ足したときに
 * 新しい状態が黙って別の文言で表示される事故を防ぐため。
 * declined（辞退）と cancelled（参加取消）は取り消し線では同じ扱いだが、
 * 文言まで同じにすると「取り消した人」に「辞退」と出て誤解を招く。
 */
const inactiveLabels: Record<string, string> = { declined: "辞退", cancelled: "取消" };

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
        const inactiveLabel = inactiveLabels[assignee.status];
        const isInactive = inactiveLabel !== undefined;

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
  deleteAction,
  edit
}: {
  item: TimetableItem;
  durationMinutes: number | undefined;
  isCurrent: boolean;
  canEdit: boolean;
  deleteAction: DeleteAction;
} & EditSupport) {
  return (
    <div className="space-y-2">
      <div
        data-testid={`timetable-item-${item.id}`}
        className={`flex flex-col gap-2 rounded-control border p-3 sm:flex-row sm:items-start sm:gap-3 ${
          isCurrent ? "border-moss bg-mist/45" : "border-line bg-surface"
        }`}
      >
        <div className="shrink-0 text-body font-bold text-ink sm:w-24">
          {formatJstTime(item.startAt)}
          {item.endAt ? (
            <span className="text-caption font-normal text-muted"> - {formatJstTime(item.endAt)}</span>
          ) : null}
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

      {canEdit && edit ? (
        <PlanTimetableForm
          action={edit.action(item.id)}
          participants={edit.participants}
          eventDates={edit.eventDates}
          defaultDate={resolveEditDefaultDate(item.startAt, edit.eventDates)}
          defaultStartTime={formatJstTime(item.startAt)}
          summaryLabel="編集"
          summaryAriaLabel={`${item.title}を編集`}
          submitLabel="保存"
          idPrefix={`timetable-edit-${item.id}`}
          defaultValues={{
            title: item.title,
            note: item.note,
            endTime: item.endAt ? formatJstTime(item.endAt) : "",
            assigneeIds: item.assignees.map((assignee) => assignee.participantId)
          }}
        />
      ) : null}
    </div>
  );
}

function TimetableBlockView({
  block,
  durations,
  current,
  canEdit,
  deleteAction,
  edit
}: {
  block: TimetableBlock;
  durations: Record<string, number>;
  current: Set<string>;
  canEdit: boolean;
  deleteAction: DeleteAction;
} & EditSupport) {
  if (block.kind === "single") {
    return (
      <TimetableRow
        item={block.item}
        durationMinutes={durations[block.item.id]}
        isCurrent={current.has(block.item.id)}
        canEdit={canEdit}
        deleteAction={deleteAction}
        edit={edit}
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
                edit={edit}
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
  deleteAction,
  edit
}: {
  items: TimetableItem[];
  now: Date;
  canEdit: boolean;
  deleteAction: DeleteAction;
} & EditSupport) {
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
              edit={edit}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
