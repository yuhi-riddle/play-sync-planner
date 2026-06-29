import type { BusyRange } from "@/lib/domain/calendar-availability";

export type GoogleFreeBusyResponse = {
  calendars?: Record<string, { busy?: BusyRange[] }>;
};

export function normalizeFreeBusyResponse(response: GoogleFreeBusyResponse, calendarId = "primary"): BusyRange[] {
  return response.calendars?.[calendarId]?.busy ?? [];
}

export function monthTimeRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error("month must be YYYY-MM");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  return {
    timeMin: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    timeMax: new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString()
  };
}

export async function fetchFreeBusy({
  accessToken,
  calendarId = "primary",
  month,
  fetchImpl = fetch
}: {
  accessToken: string;
  calendarId?: string;
  month: string;
  fetchImpl?: typeof fetch;
}): Promise<BusyRange[]> {
  const { timeMin, timeMax } = monthTimeRange(month);
  const response = await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: calendarId }]
    })
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Google Calendar availability");
  }

  return normalizeFreeBusyResponse((await response.json()) as GoogleFreeBusyResponse, calendarId);
}
