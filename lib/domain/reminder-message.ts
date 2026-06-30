export type ReminderParticipant = {
  display_name: string;
  status: string;
};

export function pendingParticipants<T extends ReminderParticipant>(participants: T[]): T[] {
  return participants.filter((participant) => participant.status === "invited");
}

export function buildReminderMessage({
  eventTitle,
  planTitle,
  pendingNames,
  answerDeadlineAt,
  reminderOffsetMinutes,
  shareUrl
}: {
  eventTitle: string | null | undefined;
  planTitle: string | null | undefined;
  pendingNames: string[];
  answerDeadlineAt: string | null | undefined;
  reminderOffsetMinutes?: number | null;
  shareUrl: string | null;
}) {
  const addressedNames = pendingNames.length > 0 ? pendingNames.map(toPoliteName).join("、") : "みなさん";
  const title = [eventTitle?.trim(), planTitle?.trim()].filter(Boolean).join(" / ") || "日程調整";
  const deadline = formatReminderDeadline(answerDeadlineAt);
  const lines = [
    `${addressedNames}`,
    "",
    `${title} の日程回答をお願いします。`,
    `回答期限: ${deadline}`,
    ""
  ];

  const reminderTime = formatReminderTime(answerDeadlineAt, reminderOffsetMinutes);
  if (reminderTime) {
    lines.splice(4, 0, `繝ｪ繝槭う繝ｳ繝・ ${reminderTime}`, "");
  }

  if (shareUrl) {
    lines.push("回答リンク:", shareUrl);
  } else {
    lines.push("回答リンクはまだ作成されていません。");
  }

  return lines.join("\n");
}

function toPoliteName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "参加者さん";
  }

  if (/(さん|様|くん|君|ちゃん)$/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}さん`;
}

function formatReminderDeadline(value: string | null | undefined) {
  if (!value) {
    return "未設定";
  }

  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatReminderTime(value: string | null | undefined, offsetMinutes: number | null | undefined) {
  if (!value || offsetMinutes === null || offsetMinutes === undefined) {
    return null;
  }

  const date = new Date(value);
  date.setMinutes(date.getMinutes() - offsetMinutes);
  return formatReminderDeadline(date.toISOString());
}
