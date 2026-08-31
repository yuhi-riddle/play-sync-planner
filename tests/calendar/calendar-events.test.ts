import { describe, expect, it, vi } from "vitest";

import {
  fetchCalendarEvents,
  insertCalendarEvent,
  monthTimeRange,
  normalizeCalendarEventsResponse
} from "@/lib/google-calendar/calendar-events";

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

  it("builds the month range on JST boundaries, not UTC", () => {
    // JST 2026-07-01 00:00 = 2026-06-30 15:00Z, JST 2026-08-01 00:00 = 2026-07-31 15:00Z
    expect(monthTimeRange("2026-07")).toEqual({
      timeMin: "2026-06-30T15:00:00.000Z",
      timeMax: "2026-07-31T15:00:00.000Z"
    });
  });

  it("handles a year boundary in JST", () => {
    expect(monthTimeRange("2026-01")).toEqual({
      timeMin: "2025-12-31T15:00:00.000Z",
      timeMax: "2026-01-31T15:00:00.000Z"
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

  it("inserts a confirmed calendar event", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "google-event-1", htmlLink: "https://calendar.google.com/event" })
    })) as unknown as typeof fetch;

    const result = await insertCalendarEvent({
      accessToken: "access-token",
      event: {
        title: "土曜チーム - 謎解き公演",
        location: "新宿",
        start: "2026-07-01T10:00:00+09:00",
        end: "2026-07-01T12:00:00+09:00"
      },
      fetchImpl
    });

    expect(result).toEqual({ id: "google-event-1", htmlLink: "https://calendar.google.com/event" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          summary: "土曜チーム - 謎解き公演",
          location: "新宿",
          start: { dateTime: "2026-07-01T10:00:00+09:00" },
          end: { dateTime: "2026-07-01T12:00:00+09:00" }
        })
      })
    );
  });

  it("inserts a confirmed calendar event with attendee emails and sends updates", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "google-event-1", htmlLink: "https://calendar.google.com/event" })
    })) as unknown as typeof fetch;

    await insertCalendarEvent({
      accessToken: "access-token",
      event: {
        title: "土曜チーム - 謎解き公演",
        location: "新宿",
        start: "2026-07-01T10:00:00+09:00",
        end: "2026-07-01T12:00:00+09:00",
        attendeeEmails: ["a@example.com", "b@example.com"]
      },
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
      expect.objectContaining({
        body: JSON.stringify({
          summary: "土曜チーム - 謎解き公演",
          location: "新宿",
          start: { dateTime: "2026-07-01T10:00:00+09:00" },
          end: { dateTime: "2026-07-01T12:00:00+09:00" },
          attendees: [{ email: "a@example.com" }, { email: "b@example.com" }]
        })
      })
    );
  });

  it("inserts an all-day confirmed calendar event with date fields", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "google-event-1" })
    })) as unknown as typeof fetch;

    await insertCalendarEvent({
      accessToken: "access-token",
      event: {
        title: "終日イベント",
        location: null,
        start: "2026-07-01T00:00:00+09:00",
        end: "2026-07-02T00:00:00+09:00",
        isAllDay: true
      },
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      expect.objectContaining({
        body: JSON.stringify({
          summary: "終日イベント",
          start: { date: "2026-07-01" },
          end: { date: "2026-07-02" }
        })
      })
    );
  });
});
