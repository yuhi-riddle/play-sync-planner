import type { BusyRange } from "@/lib/domain/calendar/calendar-availability";
import type { ConfirmedCalendarEvent } from "@/lib/domain/calendar/calendar-sync";

export type CalendarEventRange = BusyRange & {
  title: string | null;
  location: string | null;
};

type GoogleEventDate = {
  date?: string;
  dateTime?: string;
};

export type GoogleCalendarEventsResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    location?: string;
    start?: GoogleEventDate;
    end?: GoogleEventDate;
  }>;
};

function normalizeEventDate(value: GoogleEventDate | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.dateTime) {
    return value.dateTime;
  }

  if (value.date) {
    return `${value.date}T00:00:00+09:00`;
  }

  return null;
}

export function normalizeCalendarEventsResponse(response: GoogleCalendarEventsResponse): CalendarEventRange[] {
  return (response.items ?? []).flatMap((item) => {
    const start = normalizeEventDate(item.start);
    const end = normalizeEventDate(item.end);

    if (!start || !end) {
      return [];
    }

    return [
      {
        start,
        end,
        title: item.summary?.trim() || null,
        location: item.location?.trim() || null
      }
    ];
  });
}

// このアプリの月表示は JST 固定（lib/shared/format.ts）。UTC の月初を渡すと
// 月初 0:00〜9:00(JST) が抜け、翌月初 0:00〜9:00(JST) が混入する。
// JST の月境界（= 前月末 15:00 UTC）を渡す。DST の無い +09:00 固定でよい。
const JST_OFFSET_HOURS = 9;

export function monthTimeRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error("month must be YYYY-MM");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  const startOfMonthJst = (y: number, m0: number) =>
    new Date(Date.UTC(y, m0, 1, -JST_OFFSET_HOURS)).toISOString();

  return {
    timeMin: startOfMonthJst(year, monthIndex),
    timeMax: startOfMonthJst(year, monthIndex + 1)
  };
}

export async function fetchCalendarEvents({
  accessToken,
  calendarId = "primary",
  month,
  fetchImpl = fetch
}: {
  accessToken: string;
  calendarId?: string;
  month: string;
  fetchImpl?: typeof fetch;
}): Promise<CalendarEventRange[]> {
  const { timeMin, timeMax } = monthTimeRange(month);
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "2500");
  url.searchParams.set("fields", "items(id,summary,location,start,end)");

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Google Calendar events");
  }

  return normalizeCalendarEventsResponse((await response.json()) as GoogleCalendarEventsResponse);
}

export type GoogleCalendarInsertResponse = {
  id?: string;
  htmlLink?: string;
};

export async function insertCalendarEvent({
  accessToken,
  calendarId = "primary",
  event,
  fetchImpl = fetch
}: {
  accessToken: string;
  calendarId?: string;
  event: ConfirmedCalendarEvent;
  fetchImpl?: typeof fetch;
}): Promise<GoogleCalendarInsertResponse> {
  const attendeeEmails = [...new Set(event.attendeeEmails ?? [])].filter((email) => email.trim().length > 0);
  const attendees = attendeeEmails.length > 0 ? { attendees: attendeeEmails.map((email) => ({ email })) } : {};
  const eventBody = event.isAllDay
    ? {
        summary: event.title,
        ...(event.location ? { location: event.location } : {}),
        start: { date: event.start.slice(0, 10) },
        end: { date: event.end.slice(0, 10) },
        ...attendees
      }
    : {
        summary: event.title,
        ...(event.location ? { location: event.location } : {}),
        start: { dateTime: event.start },
        end: { dateTime: event.end },
        ...attendees
      };
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  if (attendeeEmails.length > 0) {
    url.searchParams.set("sendUpdates", "all");
  }

  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(eventBody)
  });

  if (!response.ok) {
    throw new Error("Failed to insert Google Calendar event");
  }

  return (await response.json()) as GoogleCalendarInsertResponse;
}
