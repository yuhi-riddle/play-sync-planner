import { Check, Trash2 } from "lucide-react";
import React from "react";

import { EmptyState, Progress, SectionHeading } from "@/components/ui";
import { sortEventTasks, summarizeEventTasks, type EventTask } from "@/lib/domain/event-tasks";

type TaskAction = (formData: FormData) => void | Promise<void>;

export type EventTaskMember = { userId: string; displayName: string };

const iconButtonClass =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2";

function AssigneeSelect({
  taskId,
  members,
  assigneeUserId,
  action
}: {
  taskId: string;
  members: EventTaskMember[];
  assigneeUserId: string | null;
  action: (taskId: string) => TaskAction;
}) {
  return (
    <form action={action(taskId)}>
      <label className="sr-only" htmlFor={`assignee-${taskId}`}>
        担当者
      </label>
      <select
        id={`assignee-${taskId}`}
        name="assignee_user_id"
        defaultValue={assigneeUserId ?? ""}
        className="min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-caption text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
      >
        <option value="">担当なし</option>
        {members.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.displayName}
          </option>
        ))}
      </select>
      <button type="submit" className="ml-2 text-caption font-bold text-pine underline focus:outline-none focus:ring-2 focus:ring-clay">
        変更
      </button>
    </form>
  );
}

export function EventTaskList({
  tasks,
  members,
  canEdit,
  createAction,
  toggleAction,
  assignAction,
  deleteAction
}: {
  tasks: EventTask[];
  members: EventTaskMember[];
  canEdit: boolean;
  createAction: TaskAction;
  toggleAction: (taskId: string) => TaskAction;
  assignAction: (taskId: string) => TaskAction;
  deleteAction: (taskId: string) => TaskAction;
}) {
  const sorted = sortEventTasks(tasks);
  const summary = summarizeEventTasks(tasks);

  return (
    <section aria-label="持ち物・役割の分担">
      <SectionHeading
        title="持ち物・役割の分担"
        description="当日までに用意するものと、担当を決められます。"
      />

      {summary.total > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-caption text-muted">
            <span>準備できたもの</span>
            <span className="font-bold text-ink">
              {summary.doneCount} / {summary.total}
            </span>
          </div>
          <Progress value={summary.doneCount} max={summary.total} label="分担の進み具合" />
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {sorted.length === 0 ? (
          <EmptyState>まだ分担はありません。持ち物や役割を書き出しておくと、当日に慌てずに済みます。</EmptyState>
        ) : (
          sorted.map((task) => (
            <div
              key={task.id}
              data-testid={`event-task-${task.id}`}
              className={`flex flex-wrap items-center gap-3 rounded-control border border-line p-3 ${
                task.doneAt ? "bg-sunken" : "bg-surface"
              }`}
            >
              {canEdit ? (
                <form action={toggleAction(task.id)}>
                  <button
                    type="submit"
                    className={iconButtonClass}
                    aria-label={task.doneAt ? `${task.title}を未完了に戻す` : `${task.title}を完了にする`}
                  >
                    <Check aria-hidden="true" className={task.doneAt ? "h-4 w-4 text-pine" : "h-4 w-4"} />
                  </button>
                </form>
              ) : null}

              <span
                data-testid="event-task-title"
                className={`min-w-0 flex-1 break-words text-body font-medium ${
                  task.doneAt ? "text-muted line-through" : "text-ink"
                }`}
              >
                {task.title}
              </span>

              {canEdit ? (
                <AssigneeSelect
                  taskId={task.id}
                  members={members}
                  assigneeUserId={task.assigneeUserId}
                  action={assignAction}
                />
              ) : (
                <span className="text-caption text-muted">{task.assigneeName ?? "担当なし"}</span>
              )}

              {canEdit ? (
                <form action={deleteAction(task.id)}>
                  <button type="submit" className={iconButtonClass} aria-label={`${task.title}を削除`}>
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </form>
              ) : null}
            </div>
          ))
        )}
      </div>

      {canEdit ? (
        <form action={createAction} className="mt-4 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="new-event-task-title">
            持ち物や役割
          </label>
          <input
            id="new-event-task-title"
            name="title"
            type="text"
            required
            maxLength={100}
            placeholder="例: 浮き輪を持っていく"
            className="min-h-11 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
          <label className="sr-only" htmlFor="new-event-task-assignee">
            担当者
          </label>
          <select
            id="new-event-task-assignee"
            name="assignee_user_id"
            defaultValue=""
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-caption text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
          >
            <option value="">担当なし</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            追加
          </button>
        </form>
      ) : null}
    </section>
  );
}
