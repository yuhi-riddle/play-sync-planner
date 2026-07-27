export type EventTask = {
  id: string;
  title: string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  doneAt: string | null;
  sortOrder: number;
};

export type EventTaskSummary = {
  total: number;
  doneCount: number;
  percent: number;
};

/** 残っている準備を先に見せる。同じ状態のものは登録順。 */
export function sortEventTasks(tasks: EventTask[]): EventTask[] {
  return [...tasks].sort((a, b) => {
    const aDone = a.doneAt ? 1 : 0;
    const bDone = b.doneAt ? 1 : 0;

    if (aDone !== bDone) {
      return aDone - bDone;
    }

    return a.sortOrder - b.sortOrder;
  });
}

export function summarizeEventTasks(tasks: EventTask[]): EventTaskSummary {
  const total = tasks.length;
  const doneCount = tasks.filter((task) => Boolean(task.doneAt)).length;

  return {
    total,
    doneCount,
    percent: total === 0 ? 0 : Math.round((doneCount / total) * 100)
  };
}
