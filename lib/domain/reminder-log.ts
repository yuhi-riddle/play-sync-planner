export type ReminderLogRecord = {
  sent_at: string;
};

export type ReminderLogSummary = {
  latestSentAt: string | null;
  totalCount: number;
};

export function summarizeReminderLogs(logs: ReminderLogRecord[]): ReminderLogSummary {
  if (logs.length === 0) {
    return {
      latestSentAt: null,
      totalCount: 0
    };
  }

  const latestSentAt = [...logs].sort((left, right) => right.sent_at.localeCompare(left.sent_at))[0]?.sent_at ?? null;

  return {
    latestSentAt,
    totalCount: logs.length
  };
}
