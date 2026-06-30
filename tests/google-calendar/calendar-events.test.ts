import { describe, expect, it, vi } from "vitest";

import { fetchCalendarEvents, monthTimeRange, normalizeCalendarEventsResponse } from "@/lib/google-calendar/calendar-events";

describe("calendar event helpers", () => {
  it("normalizes Google Calendar event responses", () => {
    const result = normalizeCalendarEventsResponse({
      items: [
        {
          id: "event-1",
          summary: "謎解き公演",
          location: "新宿",
          start: { dateTime: "2026-07-01T10:00:00+09:00" },
          end: { dateTime: "2026-07-01T11:00:00+09:00" }
        }
      ]
    });

    expect(result).toEqual([
      {
        start: "2026-07-01T10:00:00+09:00",
        end: "2026-07-01T11:00:00+09:00",
        title: "謎解き公演",
        location: "新宿"
      }
    ]);
  });

  it("keeps private events useful without exposing unavailable details", () => {
    const result = normalizeCalendarEventsResponse({
      items: [
        {
          id: "event-1",
          start: { dateTime: "2026-07-01T12:00:00+09:00" },
          end: { dateTime: "2026-07-01T13:00:00+09:00" }
        }
      ]
    });

    expect(result).toEqual([
      {
        start: "2026-07-01T12:00:00+09:00",
        end: "2026-07-01T13:00:00+09:00",
        title: null,
        location: null
      }
    ]);
  });

  it("returns an empty array for empty responses", () => {
    expect(normalizeCalendarEventsResponse({ items: [] })).toEqual([]);
  });

  it("builds an inclusive month query range", () => {
    expect(monthTimeRange("2026-07")).toEqual({
      timeMin: "2026-07-01T00:00:00.000Z",
      timeMax: "2026-08-01T00:00:00.000Z"
    });
  });

  it("fetches calendar events with title and location fields", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "event-1",
            summary: "予定",
            location: "渋谷",
            start: { dateTime: "2026-07-01T10:00:00Z" },
            end: { dateTime: "2026-07-01T11:00:00Z" }
          }
        ]
      })
    })) as unknown as typeof fetch;

    const result = await fetchCalendarEvents({ accessToken: "access-token", month: "2026-07", fetchImpl });

    expect(result).toEqual([
      {
        start: "2026-07-01T10:00:00Z",
        end: "2026-07-01T11:00:00Z",
        title: "予定",
        location: "渋谷"
      }
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("https://www.googleapis.com/calendar/v3/calendars/primary/events"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer access-token" })
      })
    );
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("singleEvents=true"), expect.anything());
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("summary%2Clocation"), expect.anything());
  });
});
