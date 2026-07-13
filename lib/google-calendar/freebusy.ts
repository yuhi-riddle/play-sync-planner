import type { BusyRange } from "@/lib/domain/calendar-availability";

export type GoogleFreeBusyResponse = {
  calendars?: Record<string, { busy?: BusyRange[] }>;
};

export class CalendarFreeBusyError extends Error {
  constructor(public readonly status: number) {
    super("Failed to fetch Google Calendar free/busy data");
    this.name = "CalendarFreeBusyError";
  }
}

export function normalizeFreeBusyResponse(response: GoogleFreeBusyResponse): BusyRange[] {
  return Object.values(response.calendars ?? {}).flatMap((calendar) => calendar.busy ?? []);
}

export async function fetchCalendarFreeBusy({
  accessToken,
  calendarId = "primary",
  timeMin,
  timeMax,
  fetchImpl = fetch
}: {
  accessToken: string;
  calendarId?: string;
  timeMin: string;
  timeMax: string;
  fetchImpl?: typeof fetch;
}): Promise<BusyRange[]> {
  const response = await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: "Asia/Tokyo",
      items: [{ id: calendarId }]
    })
  });

  if (!response.ok) {
    throw new CalendarFreeBusyError(response.status);
  }

  return normalizeFreeBusyResponse((await response.json()) as GoogleFreeBusyResponse);
}
