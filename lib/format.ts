const unsetLabel = "未設定";

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return unsetLabel;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium"
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return unsetLabel;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatTime(value: string | null | undefined): string {
  if (!value) {
    return unsetLabel;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatDateTimeRange(start: string | null | undefined, end: string | null | undefined, isAllDay = false): string {
  if (!start) {
    return unsetLabel;
  }

  if (isAllDay) {
    return formatAllDayRange(start, end);
  }

  if (!end) {
    return formatDateTime(start);
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate();

  return sameDay ? `${formatDateTime(start)} - ${formatTime(end)}` : `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

function formatAllDayRange(start: string, end: string | null | undefined): string {
  const startLabel = formatDate(start);
  if (!end) {
    return `${startLabel} 終日`;
  }

  const startDate = new Date(start);
  const inclusiveEndDate = new Date(new Date(end).getTime() - 24 * 60 * 60 * 1000);
  const sameDay =
    startDate.getFullYear() === inclusiveEndDate.getFullYear() &&
    startDate.getMonth() === inclusiveEndDate.getMonth() &&
    startDate.getDate() === inclusiveEndDate.getDate();

  return sameDay ? `${startLabel} 終日` : `${startLabel} - ${formatDate(inclusiveEndDate.toISOString())} 終日`;
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}
