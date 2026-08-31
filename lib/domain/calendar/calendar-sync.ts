export type ConfirmedCalendarEvent = {
  title: string;
  location: string | null;
  start: string;
  end: string;
  isAllDay?: boolean;
  attendeeEmails?: string[];
  /**
   * Google イベントの id を固定して冪等にする。同じ id で2回 insert すると Google が 409 を返す。
   * Google の id は [a-v0-9] のみ。planId(uuid のhex)はこの範囲に収まる。
   */
  externalId?: string;
};

type GoogleCalendarShareInput = {
  title: string;
  location?: string | null;
  start: string;
  end: string;
  details?: string | null;
};

function addHours(value: string, hours: number) {
  const offsetMatch = value.match(/([+-]\d{2}:\d{2})$/);
  const target = new Date(new Date(value).getTime() + hours * 60 * 60 * 1000);

  if (!offsetMatch) {
    return target.toISOString();
  }

  const suffix = offsetMatch[1];
  const sign = suffix.startsWith("-") ? -1 : 1;
  const [hoursPart, minutesPart] = suffix.slice(1).split(":").map(Number);
  const offsetMinutes = sign * (hoursPart * 60 + minutesPart);
  const local = new Date(target.getTime() + offsetMinutes * 60 * 1000);

  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}T${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}:${String(local.getUTCSeconds()).padStart(2, "0")}.000${suffix}`;
}

export function buildConfirmedCalendarEvent({
  planTitle,
  eventTitle,
  locationName,
  startAt,
  endAt,
  isAllDay = false
}: {
  planTitle?: string | null;
  eventTitle?: string | null;
  locationName?: string | null;
  startAt: string;
  endAt?: string | null;
  isAllDay?: boolean;
}): ConfirmedCalendarEvent {
  const normalizedPlanTitle = planTitle?.trim();
  const normalizedEventTitle = eventTitle?.trim();
  const title =
    normalizedPlanTitle && normalizedEventTitle
      ? `${normalizedPlanTitle} - ${normalizedEventTitle}`
      : normalizedPlanTitle || normalizedEventTitle || "Madoiの日程調整";

  return {
    title,
    location: locationName?.trim() || null,
    start: startAt,
    end: endAt || addHours(startAt, 2),
    ...(isAllDay ? { isAllDay } : {})
  };
}

function formatGoogleCalendarDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildGoogleCalendarShareUrl({ title, location, start, end, details }: GoogleCalendarShareInput) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", title);
  url.searchParams.set("dates", `${formatGoogleCalendarDate(start)}/${formatGoogleCalendarDate(end)}`);

  if (location?.trim()) {
    url.searchParams.set("location", location.trim());
  }

  if (details?.trim()) {
    url.searchParams.set("details", details.trim());
  }

  return url.toString();
}

/** RFC 5545 は1行75オクテットまで。超えたぶんは継続行へ折り返す。 */
const ICS_LINE_OCTET_LIMIT = 75;

/**
 * TEXT 値のエスケープ。`\` `;` `,` と改行が対象（`:` は不要）。
 * ここを飛ばすと、題名に「、」ではなく「,」が入っただけで値が2つに割れて読まれる。
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * 長い行を継続行へ折り返す。継続行は先頭に空白を1つ置く（その空白も75に数える）。
 * 数えるのは文字数ではなくオクテット数。日本語は1文字3バイトなので、
 * 文字数で数えると上限を軽く超える。かといってバイト列で切るとマルチバイトの
 * 途中で割れて壊れるため、1文字ずつ足しながら見る。
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";
  let currentOctets = 0;

  for (const char of line) {
    const charOctets = encoder.encode(char).length;
    const limit = chunks.length === 0 ? ICS_LINE_OCTET_LIMIT : ICS_LINE_OCTET_LIMIT - 1;

    if (currentOctets + charOctets > limit) {
      chunks.push(current);
      current = "";
      currentOctets = 0;
    }

    current += char;
    currentOctets += charOctets;
  }

  chunks.push(current);

  return chunks.join("\r\n ");
}

/** 終日予定用。日付だけを YYYYMMDD で書く。 */
function formatIcsDate(value: string): string {
  return value.slice(0, 10).replace(/-/g, "");
}

/**
 * 確定した予定を .ics（iCalendar）にする。
 *
 * Googleカレンダー連携は任意なので、Googleを使っていない人にも予定を渡せる出口が要る。
 * Apple カレンダー、Outlook、Thunderbird などが読める。
 *
 * 終日予定は `DTSTART;VALUE=DATE` で書き、`DTEND` は「終わりの翌日」を指す（RFC 5545）。
 * plans.confirmed_end_at は終日のときすでにその形で入っている
 * （lib/shared/format.ts の formatAllDayRange が表示のために24時間引いている）。
 * Googleへ送る側（lib/google-calendar/calendar-events.ts）も同じ値をそのまま使っており、
 * ここだけ1日足すと2つの出口で日付がずれる。
 *
 * 改行は CRLF。LF だけだと読み込めないアプリがある。
 */
export function buildIcsCalendar({
  uid,
  event,
  now = new Date()
}: {
  uid: string;
  event: ConfirmedCalendarEvent;
  now?: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Madoi//Schedule//JA",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatGoogleCalendarDate(now.toISOString())}`,
    ...(event.isAllDay
      ? [`DTSTART;VALUE=DATE:${formatIcsDate(event.start)}`, `DTEND;VALUE=DATE:${formatIcsDate(event.end)}`]
      : [`DTSTART:${formatGoogleCalendarDate(event.start)}`, `DTEND:${formatGoogleCalendarDate(event.end)}`]),
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
